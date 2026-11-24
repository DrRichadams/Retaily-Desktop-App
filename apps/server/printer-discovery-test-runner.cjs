process.geteuid ??= () => 0;

import("tsx/esm").then(() => import("./printer-discovery-test.ts"));
