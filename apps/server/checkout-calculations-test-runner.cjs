process.geteuid ??= () => 0;

import("tsx/esm").then(() => import("./checkout-calculations-test.ts"));
