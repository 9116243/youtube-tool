# Neon Icons Ingest
将你的“矢量图/1.jpg ~ 60.jpg”批量导入为标准命名：/public/brand/icons/neon/vi-001.webp ...

两种方式：

## A) Node + sharp 批处理（推荐）
1. `npm i sharp`
2. 运行：`node scripts/ingest_icons.mjs ./矢量图`
   - 会输出 webp/avif/png 三份，并生成清单 icons.json。

## B) 仅重命名（PowerShell 简版）
`pwsh scripts/rename_icons.ps1 -Src "./矢量图"`
只会复制并重命名为 vi-001.jpg...（不转码）。
