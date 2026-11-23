process.geteuid ??= () => 0;

import("tsx/esm").then(() => import("./hardware-core-test.ts"));
