"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = require("./app");
const database_1 = require("./config/database");
const env_1 = require("./config/env");
const scheduler_1 = require("./services/scheduler");
async function bootstrap() { await (0, database_1.connectDatabase)(); app_1.app.listen(env_1.env.PORT, () => { console.log(`API: http://localhost:${env_1.env.PORT}`); (0, scheduler_1.startScheduler)(); }); }
bootstrap().catch(e => { console.error("Startup failed", e); process.exit(1); });
