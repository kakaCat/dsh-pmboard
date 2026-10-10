/**
 * 工具面**入口的稳定间接层**（REQ-261009174713-7bc8 · t15）。
 *
 * 静态 `import` 无法像路径字符串那样「哪边存在就用哪边」——但可以让**全仓只有一个地方**知道工具面入口在哪：
 * 搬迁时只改本文件一行，所有 `import ... from 'tests/helpers/tools-entry.js'` 的判据都不用动。
 *
 * @module tests/helpers/tools-entry
 */
export * from 'tool-pmboard/index.js'
