import { app } from "./app";
import { connectDatabase } from "./config/database";
import { env } from "./config/env";
import { startScheduler } from "./services/scheduler";
async function bootstrap(){await connectDatabase();app.listen(env.PORT,()=>{console.log(`API: http://localhost:${env.PORT}`); startScheduler();});}
bootstrap().catch(e=>{console.error("Startup failed",e);process.exit(1);});