/**
 * M6 测试聚合入口。
 *
 * spec §2.1 把 M6 测试文件冻结在 apps/core/src/shot/*.test.ts（与实现同目录）；
 * 但 apps/core 的 vitest.config.ts（既有文件，冻结不许改）只收集 test/**。
 * 本文件把 src/shot 的全部套件挂进收集树，不改任何既有文件。
 */
import "../src/shot/cascade.test.js";
import "../src/shot/dialogueBudget.test.js";
import "../src/shot/slots.test.js";
import "../src/shot/initialPosition.test.js";
import "../src/shot/assetCodes.test.js";
import "../src/shot/riskScore.test.js";
import "../src/shot/causality.test.js";
import "../src/shot/triggers.test.js";
