import { getApp } from "./index";

const port = Number(process.env.API_PORT ?? 3001);
getApp().listen(port);
console.log(`Nexo API em http://localhost:${port}/api`);
