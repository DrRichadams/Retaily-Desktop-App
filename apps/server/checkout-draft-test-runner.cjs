process.geteuid ??= () => 0;

import("tsx/esm").then(() => import("./checkout-draft-test.ts"));
