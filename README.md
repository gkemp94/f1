import Fastify from "fastify";
import fastifyWebsocket from "@fastify/websocket";
import { Data, Session } from "./models/Session";

const app = Fastify({ logger: true });

app.register(fastifyWebsocket);

const session = new Session();

app.register(async function (fastify) {
fastify.get("/", { websocket: true }, (socket, req) => {
// White with 50% opacity
const DEFAULT = "rgba(255, 255, 255, .5)";
const points: number = (req.query as any).points;
const onEmit = (data: Data) => {
const array = new Array(points).fill(DEFAULT);
data
.sort((a, b) => a.position - b.position)
.forEach((point) => {
if (!point.on_track) return;
let index = Math.floor((point.percentage / 100) \* points);
while (true) {
if (array[index] === DEFAULT) {
array[index] = session.driverColorsById[point.driver_number];
break;
} else {
index = index === 0 ? points - 1 : index - 1;
}
}
});
socket.send(JSON.stringify(array));
};

    session.subscribe(onEmit);

    socket.on("close", () => {
      session.unsubscribe(onEmit);
    });

});
});

app.listen({ port: 3000 });

session.start();
