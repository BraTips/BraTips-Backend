import { connectDatabase, disconnectDatabase } from "../config/database";
import { env } from "../config/env";
import { User } from "../models/User";
import bcrypt from "bcryptjs";

async function main() {
  await connectDatabase();
  const email=env.ADMIN_BOOTSTRAP_EMAIL.toLowerCase();
  const hash=await bcrypt.hash(env.ADMIN_BOOTSTRAP_PASSWORD,12);
  const user=await User.findOneAndUpdate(
    {email},
    {$set:{name:env.ADMIN_BOOTSTRAP_NAME,passwordHash:hash,role:"admin",status:"active"}},
    {upsert:true,new:true,setDefaultsOnInsert:true}
  );
  console.log(`Admin ready: ${user.email} (${user.id})`);
  await disconnectDatabase();
}
main().catch(async e=>{console.error(e);await disconnectDatabase();process.exit(1);});