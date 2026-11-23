process.geteuid ??= () => 0;

import("tsx/esm").then(() => import("./checkout-attempt-flow-test.ts"));
