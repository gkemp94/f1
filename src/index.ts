import Fastify from "fastify";
import fastifyWebsocket from "@fastify/websocket";
import { Data, Session } from "./models/Session";

const app = Fastify({ logger: true });

app.register(fastifyWebsocket);

const session = new Session();

app.register(async function (fastify) {
  fastify.get("/pixels", { websocket: true }, (socket, req) => {
    const pixels = 300;
    const DEFAULT = [0, 0, 0, 0] as readonly [number, number, number, number];

    const onData = (data: Data) => {
      const payload = new Array(pixels).fill(DEFAULT);
      const newPayload: Record<string, [number, number, number, number]> = {};
      data
        .sort((a, b) => a.position - b.position)
        .forEach((point) => {
          if (!point.on_track) return;
          let index = Math.floor((point.percentage / 100) * pixels);
          while (true) {
            if (payload[index] === DEFAULT) {
              payload[index] = session.driverColorsById[point.driver_number];
              newPayload[index] = session.driverColorsById[point.driver_number];
              break;
            } else {
              index = index === 0 ? pixels - 1 : index - 1;
            }
          }
        });

      socket.send(JSON.stringify(Object.entries(newPayload)));
    };

    session.subscribe(onData);

    socket.on("close", () => {
      session.unsubscribe(onData);
    });
  });

  fastify.get("/health", () => {
    return { status: "ok2" };
  });
});

session.start();

app.listen({ port: 8080 });
