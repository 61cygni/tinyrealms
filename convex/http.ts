import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { invoke, invokeStream, options as aiOptions } from "./ai";

const http = httpRouter();
auth.addHttpRoutes(http);
http.route({ path: "/ai/invoke", method: "POST", handler: invoke });
http.route({ path: "/ai/invoke", method: "OPTIONS", handler: aiOptions });
http.route({ path: "/ai/stream", method: "POST", handler: invokeStream });
http.route({ path: "/ai/stream", method: "OPTIONS", handler: aiOptions });

export default http;
