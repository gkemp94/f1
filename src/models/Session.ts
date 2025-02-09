import { Client } from "pg";
import dotenv from "dotenv";
import chroma from "chroma-js";

dotenv.config();

export type Data = {
  target_date: number;
  percentage: number;
  on_track: boolean;
  driver_number: string;
  position: number;
}[];

const HZ = 30;

const DB_URL = process.env.DATABASE_URL;

type Subscriber = (data: Data) => void;

const QUERY = `
  WITH next_ts AS (
      SELECT DISTINCT date
      FROM car_data
      WHERE date > $1
      ORDER BY date
      LIMIT $2
  ),
  all_drivers AS (
      SELECT DISTINCT driver_number 
      FROM car_data
  ),
  combos AS (
      SELECT d.driver_number, t.date AS target_date
      FROM all_drivers d
      CROSS JOIN next_ts t
  )
  SELECT 
      combos.target_date,
      combos.driver_number,
      -- 4. LATERAL JOIN to find the latest row at or before target_date
      row_data.*
  FROM combos
  LEFT JOIN LATERAL (
      SELECT td.*
      FROM car_data td
      WHERE td.driver_number = combos.driver_number
        AND td.date <= combos.target_date
      ORDER BY td.date DESC
      LIMIT 1
  ) AS row_data ON TRUE
  ORDER BY combos.target_date, combos.driver_number;
`;

export class Session {
  private data: Data[] = [];
  private readonly limit = 200;
  private subscribers: Subscriber[] = [];
  private isLoading = false;
  private isComplete = false;

  private maxLoadedT = "2024-07-07T14:00:00.000Z";
  private client = new Client({ connectionString: DB_URL });
  public driverColorsById: Record<string, [number, number, number, number]> = {};

  private t0 = 0;
  private sessiont0 = 0;
  private sessionKey = 9558;
  private previous: Data | null = null;

  public async start() {
    // Connect
    await this.client.connect();
    // Load
    await this.loadDrivers();
    await this.load();
    this.t0 = Date.now();
    this.sessiont0 = new Date(this.data[0][0].target_date).getTime();
    this.emit();
  }

  private async loadDrivers() {
    const { rows } = await this.client.query(
      "SELECT driver_number, team_color FROM driver_data where session_key = $1",
      [this.sessionKey]
    );
    this.driverColorsById = rows.reduce((acc, row) => {
      acc[row.driver_number] = chroma(`#${row.team_color}`).rgb().concat(0);
      return acc;
    }, {});
  }

  private async emit() {
    const [next] = this.data.splice(0, 1);
    const nextTs = new Date(next[0].target_date).getTime();
    const delay = (nextTs - this.sessiont0) / 1 - (Date.now() - this.t0);

    if (this.data.length < this.limit / 2 && !this.isLoading && !this.isComplete) {
      void this.load();
    }

    const int = setInterval(() => {
      if (!this.previous) return;
      // Percent Between Previous & Next
      const diffBetweenTs = nextTs - new Date(this.previous[0].target_date).getTime();
      const d = (nextTs - this.sessiont0) / 1 - (Date.now() - this.t0);
      const percent = 1 - d / diffBetweenTs;
      const data = this.previous.map((prev, i) => {
        const nextData = next.find((n) => n.driver_number === prev.driver_number);
        if (!nextData) return prev;

        let nextDataPercentage = nextData.percentage;

        if (Math.abs(nextData.percentage - prev.percentage) > Math.abs(nextData.percentage - prev.percentage + 100)) {
          nextDataPercentage += 100;
        }

        return {
          target_date: nextData.target_date,
          percentage: prev.percentage + (nextDataPercentage - prev.percentage) * percent,
          on_track: prev.on_track,
          driver_number: prev.driver_number,
          position: prev.position,
        };
      });
      this.subscribers.forEach((cb) => cb(data));
    }, 1000 / HZ);

    setTimeout(() => {
      clearInterval(int);
      this.subscribers.forEach((cb) => cb(next));
      this.previous = next;
      if (this.data.length) {
        this.emit();
      } else {
        this.restart();
      }
    }, delay);
  }

  private async restart() {
    this.maxLoadedT = "2024-07-07T14:00:00.000Z";
    this.isComplete = false;
    await this.load();
    this.t0 = Date.now();
    this.sessiont0 = new Date(this.data[0][0].target_date).getTime();
    this.emit();
  }

  private async load(): Promise<void> {
    this.isLoading = true;
    const t0 = performance.now();
    const { rows } = await this.client.query(QUERY, [this.maxLoadedT, this.limit]);
    if (!rows.length) {
      this.isLoading = false;
      this.isComplete = true;
      return;
    }
    this.maxLoadedT = rows[rows.length - 1].target_date;

    const groupedByDate = rows.reduce((acc, row) => {
      acc[row.target_date.getTime()] = acc[row.target_date.getTime()] || [];
      acc[row.target_date.getTime()].push(row);
      return acc;
    }, {});

    this.data = this.data.concat(Object.values(groupedByDate));
    this.isLoading = false;
    console.log("Loaded", this.data.length, "in", performance.now() - t0, "ms");
  }

  public subscribe(callback: Subscriber): void {
    this.subscribers.push(callback);
  }

  public unsubscribe(callback: Subscriber): void {
    this.subscribers = this.subscribers.filter((cb) => cb !== callback);
  }
}
