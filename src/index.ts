import Fastify from "fastify";
import fastifyWebsocket from "@fastify/websocket";

const app = Fastify({ logger: true });

app.register(fastifyWebsocket);

app.register(async function (fastify) {
  fastify.get("/pixels", { websocket: true }, (socket, req) => {
    const interval = setInterval(() => {
      socket.send(JSON.stringify({ type: "ping" }));
    });
    socket.on("close", () => {
      clearInterval(interval);
    });
  });

  fastify.get("/health", () => {
    return { status: "ok" };
  });
});

app.listen({ port: 8080 });
