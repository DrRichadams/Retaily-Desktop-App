process.geteuid ??= () => 0;

import("tsx/esm").then(() => import("./printer-configuration-test.ts"));
