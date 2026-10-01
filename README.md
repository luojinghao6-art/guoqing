# 代码书锦绣 · 指尖颂家国 —— 国庆主题代码作品

本目录包含本次活动的两个提交作品：

1. **Web 动态贺卡（主作品）**：纯 HTML / CSS / Canvas 实现，六幕场景共 54.5 秒，包含国旗、中国地图、文字烟花与祝福终章，支持点击放烟花等交互。
2. **Python turtle 国旗绘图**：按《国旗制法说明》的国标几何，用 Python 的 turtle 库绘制五星红旗。

## 目录结构

```text
国庆代码作品/
├── web/                  Web 贺卡源码（入口 web/index.html）
├── python/flag_turtle.py Python 国旗绘图源码
├── shots/                运行截图与成品演示视频
├── docs/作品说明.md       提交用说明文档
└── tools/                开发辅助工具（截图、冒烟测试、视频录制等）
```

## 运行方法

### Linux 一键运行版（推荐提交用）

`dist/national-day-card-linux-amd64` 是单个静态二进制，已把 `web/` 全部资源编译进程序内部，
在 **Linux amd64** 机器上直接执行即可：

```bash
chmod +x national-day-card-linux-amd64
./national-day-card-linux-amd64
```

启动后服务固定监听 **http://127.0.0.1:55633/**，并自动打开默认浏览器；按 Ctrl+C 退出。
可选环境变量：`PORT` 改端口、`HOST` 改监听地址、`NO_OPEN=1` 禁止自动开浏览器。
如需重新生成，在项目根目录执行：

```bash
GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags "-s -w" -o dist/national-day-card-linux-amd64 .
```

### Windows 一键运行版（本地预览用）

`dist/national-day-card-windows-amd64.exe` 是 Windows amd64 可执行文件，双击或命令行运行：

```powershell
dist\national-day-card-windows-amd64.exe
```

启动后同样监听 **http://127.0.0.1:55633/**，并自动打开默认浏览器。Windows 版、Linux 版均可通过
`PORT`、`HOST`、`NO_OPEN=1` 环境变量调整端口、监听地址和是否自动开浏览器。

### Web 贺卡（无需服务器、无第三方依赖）

直接用浏览器打开 `web/index.html` 即可。开场“开启贺卡”按钮保留，页面载入约 1.1 秒后会自动
进入动画，也可以点击按钮立即开启。

可选 URL 参数（在地址栏 index.html 后追加）：

```text
?manual=1   保留手动点击开场，关闭自动进入
?t=28.5    直达第 28.5 秒的画面
?scene=3   直达第 3 个场景（0 启幕 / 1 五星红旗 / 2 锦绣山河 / 3 深情告白 / 4 烟花盛典 / 5 祝福祖国）
?grid=1    默认显示国旗国标网格
?hud=0     隐藏控制条
```

交互说明：

| 操作 | 效果 |
| --- | --- |
| 点击画面 | 在点击处放一朵烟花 |
| 空格 | 播放 / 暂停 |
| R | 从头重播 |
| G | 显示 / 隐藏国旗国标网格 |
| F | 全屏 |

### Python 国旗

```text
python python/flag_turtle.py                 # 默认参数，带动画
python python/flag_turtle.py --grid          # 叠加 30x20 国标网格
python python/flag_turtle.py --verify        # 几何自检（不开窗口）
python python/flag_turtle.py --shot out.png  # 画完自动截图
```

## 技术要点

- **国标国旗**：旗面 3:2，横向 30 格、纵向 20 格；大五角星中心在网格 (5,5)、外接圆半径 3u；四颗小五角星中心 (10,2)、(12,4)、(12,7)、(10,9)，半径 1u，各有一角正对大星中心；五角星内顶点半径用黄金比推导 `rho = 1/phi^2`。
- **锦绣山河地图**：基于阿里云 DataV 公开行政区划数据，先做 Albers 等积圆锥投影，再扫描线取点得到约 2.3 万个点；按离起点距离排序分成 72 批，离屏缓存 + 单次 `drawImage`，实现“点阵汇聚成中国地图”。
- **确定性渲染**：整部动画由“当前时刻 t”纯函数算出，随机数可播种；URL 加 `?t=` 可直达任意画面，`tools/record_video.js` 据此逐帧截图合成演示视频，画面与实时播放一致。
- **粒子烟花引擎**：预渲染发光圆点贴图、粒子池复用；心形、五角星、文字通过离屏画布采样不透明像素得到粒子目标点集。

## 提交材料清单

- 完整源代码：`web/`、`python/`
- 运行截图：`shots/01_启幕.png` ~ `shots/08_点击后播放.png`、`shots/python_flag.png`、`shots/python_flag_grid.png`
- 成品视频：`shots/国庆祝福_作品视频.mp4`（1920×1080、30fps、54.5 秒）
- 说明文档：`docs/作品说明.md`
