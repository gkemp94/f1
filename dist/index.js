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
const fastify_1 = __importDefault(require("fastify"));
const websocket_1 = __importDefault(require("@fastify/websocket"));
const Session_1 = require("./models/Session");
const app = (0, fastify_1.default)({ logger: true });
app.register(websocket_1.default);
const session = new Session_1.Session();
app.register(function (fastify) {
    return __awaiter(this, void 0, void 0, function* () {
        fastify.get("/pixels", { websocket: true }, (socket, req) => {
            const pixels = 300;
            const DEFAULT = [0, 0, 0, 0];
            const onData = (data) => {
                const payload = new Array(pixels).fill(DEFAULT);
                const newPayload = {};
                data
                    .sort((a, b) => a.position - b.position)
                    .forEach((point) => {
                    if (!point.on_track)
                        return;
                    let index = Math.floor((point.percentage / 100) * pixels);
                    while (true) {
                        if (payload[index] === DEFAULT) {
                            payload[index] = session.driverColorsById[point.driver_number];
                            newPayload[index] = session.driverColorsById[point.driver_number];
                            break;
                        }
                        else {
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
});
session.start();
app.listen({ port: 8080 });
