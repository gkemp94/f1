"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Session = void 0;
const pg_1 = require("pg");
const dotenv_1 = __importDefault(require("dotenv"));
const chroma_js_1 = __importDefault(require("chroma-js"));
dotenv_1.default.config();
const HZ = 30;
const DB_URL = process.env.DATABASE_URL;
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
      WHERE session_key = $3
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
      WHERE td.session_key = $3
        AND td.driver_number = combos.driver_number
        AND td.date <= combos.target_date
      ORDER BY td.date DESC
      LIMIT 1
  ) AS row_data ON TRUE
  ORDER BY combos.target_date, combos.driver_number;
`;
class Session {
    constructor() {
        this.data = [];
        this.limit = 200;
        this.subscribers = [];
        this.isLoading = false;
        this.isComplete = false;
        this.maxLoadedT = "2024-07-07T14:00:00.000Z";
        this.client = new pg_1.Client({ connectionString: DB_URL });
        this.driverColorsById = {};
        this.t0 = 0;
        this.sessiont0 = 0;
        this.sessionKey = 9558;
        this.previous = null;
    }
    start() {
        return __awaiter(this, void 0, void 0, function* () {
            // Connect
            yield this.client.connect();
            // Load
            yield this.loadDrivers();
            yield this.load();
            this.t0 = Date.now();
            this.sessiont0 = new Date(this.data[0][0].target_date).getTime();
            this.emit();
        });
    }
    loadDrivers() {
        return __awaiter(this, void 0, void 0, function* () {
            const { rows } = yield this.client.query("SELECT driver_number, team_color FROM driver_data where session_key = $1", [this.sessionKey]);
            this.driverColorsById = rows.reduce((acc, row) => {
                acc[row.driver_number] = (0, chroma_js_1.default)(`#${row.team_color}`).rgb().concat(0);
                return acc;
            }, {});
        });
    }
    emit() {
        return __awaiter(this, void 0, void 0, function* () {
            const [next] = this.data.splice(0, 1);
            const nextTs = new Date(next[0].target_date).getTime();
            const delay = (nextTs - this.sessiont0) / 1 - (Date.now() - this.t0);
            if (this.data.length < this.limit / 2 && !this.isLoading && !this.isComplete) {
                void this.load();
            }
            const int = setInterval(() => {
                if (!this.previous)
                    return;
                // Percent Between Previous & Next
                const diffBetweenTs = nextTs - new Date(this.previous[0].target_date).getTime();
                const d = (nextTs - this.sessiont0) / 1 - (Date.now() - this.t0);
                const percent = 1 - d / diffBetweenTs;
                const data = this.previous.map((prev, i) => {
                    const nextData = next.find((n) => n.driver_number === prev.driver_number);
                    if (!nextData)
                        return prev;
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
                }
                else {
                    this.restart();
                }
            }, delay);
        });
    }
    restart() {
        return __awaiter(this, void 0, void 0, function* () {
            this.maxLoadedT = "2024-07-07T14:00:00.000Z";
            this.isComplete = false;
            yield this.load();
            this.t0 = Date.now();
            this.sessiont0 = new Date(this.data[0][0].target_date).getTime();
            this.emit();
        });
    }
    load() {
        return __awaiter(this, void 0, void 0, function* () {
            this.isLoading = true;
            const t0 = performance.now();
            const { rows } = yield this.client.query(QUERY, [this.maxLoadedT, this.limit, this.sessionKey]);
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
        });
    }
    subscribe(callback) {
        this.subscribers.push(callback);
    }
    unsubscribe(callback) {
        this.subscribers = this.subscribers.filter((cb) => cb !== callback);
    }
}
exports.Session = Session;
