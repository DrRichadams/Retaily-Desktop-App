process.geteuid ??= () => 0;

import("tsx/esm").then(() => import("./receipt-engine-test.ts"));
