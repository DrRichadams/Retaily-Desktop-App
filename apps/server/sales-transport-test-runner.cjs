// tsx calls os.userInfo() to name its temporary directory on Windows Node,
// where process.geteuid() is unavailable. Provide a stable cache suffix first.
process.geteuid ??= () => 0;

import("tsx/esm").then(() => import("./sales-transport-test.ts"));
