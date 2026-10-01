# -*- coding: utf-8 -*-
"""
flag_turtle.py —— 用 Python 的 turtle 库绘制中华人民共和国国旗
================================================================

一、几何依据
------------
1949 年 9 月 27 日中国人民政治协商会议第一届全体会议通过的《国旗制法说明》，
（现行国家标准 GB 12982《国旗》沿用同一套几何）：

  1. 旗面为红色，长方形，长宽之比为 3 : 2。
  2. 把旗面横向等分 30 格、纵向等分 20 格，每格是一个小正方形，
     其边长记作 u（u = 旗宽 / 30 = 旗高 / 20）。
  3. 大五角星：中心在"上 5 格、左 5 格"处（网格坐标 (5, 5)），
     外接圆半径 3u，其中一个角尖正对上方。
  4. 四颗小五角星：外接圆半径 1u，中心分别在网格坐标
     (10, 2)、(12, 4)、(12, 7)、(10, 9) 处；
     每颗小五角星各有一个角尖正对大五角星的中心。
  5. 颜色：旗面 #DE2910，五角星 #FFDE00。

二、五角星的顶点
----------------
正五角星由 10 个顶点组成，外顶点与内顶点交替出现：

    外顶点半径 = R
    内顶点半径 = R * rho,   rho = (3 - sqrt(5)) / 2 ≈ 0.381966

    第 i 个顶点相对星心的角度 = 起始角 + i * 36°， i = 0..9

rho 的来历：五角星的内顶点是两条"隔点连线"的交点。把黄金比 phi = (1+sqrt(5))/2
代入可解得 rho = 1/phi^2 = (3 - sqrt(5))/2 ≈ 0.381966；
另一种等价写法是 rho = 1 / (1 + 2*cos(36°))。
本程序用前一种计算，并在 --verify 里用后一种交叉校验。

三、用法
--------
    python flag_turtle.py                          # 默认参数，带动画
    python flag_turtle.py --width 900              # 指定旗宽（像素）
    python flag_turtle.py --no-anim                # 关闭绘制动画
    python flag_turtle.py --grid                   # 叠加 30x20 国标网格
    python flag_turtle.py --verify                 # 只做几何自检，不开窗口
    python flag_turtle.py --shot out.png           # 画完自动截图
    python flag_turtle.py --shot out.png --keep    # 截图后保留窗口
"""

import argparse
import ctypes
import math
import os
import sys
import time

# ---------------------------------------------------------------- DPI 适配
# Windows 上如果进程不是 DPI 感知的，Tk 报告的是"逻辑像素"，
# 而 PIL.ImageGrab 抓的是"物理像素"，两者会差一个系统缩放倍率，
# 导致截图错位甚至把旗面裁掉。所以要在创建任何窗口之前声明 DPI 感知。


def _enable_dpi_awareness():
    """让进程按物理像素工作（Windows 专属；其它平台静默跳过）。"""
    if sys.platform != "win32":
        return "非 Windows，跳过"
    try:
        ctypes.windll.shcore.SetProcessDpiAwareness(2)   # PROCESS_PER_MONITOR_DPI_AWARE
        return "per-monitor"
    except Exception:
        pass
    try:
        ctypes.windll.user32.SetProcessDPIAware()        # Vista/7 老接口
        return "system"
    except Exception:
        return "失败"


DPI_MODE = _enable_dpi_awareness()

import turtle          # noqa: E402  （必须在 DPI 设置之后导入）
from turtle import Turtle, Screen   # noqa: E402

# ---------------------------------------------------------------- 常量

RED = "#DE2910"        # 旗面红（国标）
YELLOW = "#FFDE00"     # 五角星黄（国标）
BACKDROP = "#141821"   # 展示用深色背景（非旗面颜色）

RHO = (3 - math.sqrt(5)) / 2   # 内顶点 / 外顶点 半径比 ≈ 0.381966

GRID_W = 30.0          # 旗面横向 30 格
GRID_H = 20.0          # 旗面纵向 20 格

BIG_STAR = (5.0, 5.0)                          # 大五角星中心（网格坐标）
BIG_R = 3.0                                    # 大五角星外接圆半径（单位：格）
SMALL_STARS = [(10.0, 2.0), (12.0, 4.0),       # 四颗小五角星中心
               (12.0, 7.0), (10.0, 9.0)]
SMALL_R = 1.0                                  # 小五角星外接圆半径（单位：格）

CAPTION_H = 150.0      # 旗面下方文字区高度（世界坐标单位）
MARGIN = 30.0          # 四周留白


# ---------------------------------------------------------------- 几何计算

def star_points(cx, cy, radius, rot_deg):
    """返回五角星的 10 个顶点坐标。

    cx, cy  : 星心坐标
    radius  : 外接圆半径
    rot_deg : 第 0 号（外）顶点的方向角（度），0° 指向 +x，逆时针为正
    """
    pts = []
    for i in range(10):
        r = radius if i % 2 == 0 else radius * RHO
        a = math.radians(rot_deg + i * 36.0)
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def grid_to_pixel(gx, gy, width):
    """把网格坐标换算成 turtle 画布坐标。

    画布坐标原点在旗面中心、y 轴向上；
    网格坐标原点在旗面左上角、y 轴向下，所以 y 要翻转。
    """
    u = width / GRID_W
    return (gx - GRID_W / 2.0) * u, (GRID_H / 2.0 - gy) * u


def small_star_rotation(gx, gy, width):
    """小五角星第 0 号顶点应指向大五角星中心，返回该方向角（度）。"""
    bx, by = grid_to_pixel(*BIG_STAR, width)
    sx, sy = grid_to_pixel(gx, gy, width)
    return math.degrees(math.atan2(by - sy, bx - sx))


# ---------------------------------------------------------------- 几何自检

def check_geometry(width=900.0):
    """按《国旗制法说明》逐条校验，返回 [(项目, 是否通过, 说明), ...]。"""
    u = width / GRID_W
    height = width * 2.0 / 3.0
    out = []

    def chk(name, ok, detail):
        out.append((name, bool(ok), detail))

    # 1. 长宽比 3:2
    chk("旗面长宽比 = 3:2", abs(height - GRID_H * u) < 1e-9 and abs(width / height - 1.5) < 1e-12,
        "%.4f x %.4f，比值 %.6f" % (width, height, width / height))

    # 2. 每格为正方形
    chk("30x20 网格为正方形", abs(width / GRID_W - height / GRID_H) < 1e-9,
        "u = %.6f px" % u)

    # 3. 大星：半径 3u，中心 (5,5)，一角尖朝正上
    bx, by = grid_to_pixel(*BIG_STAR, width)
    pts = star_points(bx, by, BIG_R * u, 90.0)
    tip = pts[0]
    chk("大星外接圆半径 = 3u", abs(BIG_R * u - 3.0 * u) < 1e-9, "3u = %.4f px" % (3.0 * u))
    chk("大星中心在网格 (5,5)", abs(BIG_STAR[0] - 5) < 1e-9 and abs(BIG_STAR[1] - 5) < 1e-9,
        "(%.1f, %.1f)" % BIG_STAR)
    chk("大星一角尖朝正上", abs(tip[0] - bx) < 1e-9 and tip[1] > by + 2.99 * u,
        "尖点 y 高出星心 %.4f u" % ((tip[1] - by) / u))
    chk("大星外顶点半径一致",
        all(abs(math.hypot(pts[i][0] - bx, pts[i][1] - by) - 3.0 * u) < 1e-9 for i in range(0, 10, 2)),
        "5 个外顶点均为 3u")
    chk("大星内顶点半径 = 3u*rho",
        all(abs(math.hypot(pts[i][0] - bx, pts[i][1] - by) - 3.0 * u * RHO) < 1e-9 for i in range(1, 10, 2)),
        "rho = %.12f" % RHO)

    # rho 的两种算法交叉校验：(3-sqrt5)/2  ==  1/(1+2cos36)  ==  1/phi^2
    rho_b = 1.0 / (1.0 + 2.0 * math.cos(math.radians(36.0)))
    phi = (1.0 + math.sqrt(5.0)) / 2.0
    rho_c = 1.0 / (phi * phi)
    chk("rho 交叉校验 (3-sqrt5)/2 == 1/(1+2cos36) == 1/phi^2",
        abs(RHO - rho_b) < 1e-15 and abs(RHO - rho_c) < 1e-15,
        "%.16f / %.16f / %.16f" % (RHO, rho_b, rho_c))

    # 4. 四颗小星
    for k, (gx, gy) in enumerate(SMALL_STARS, 1):
        chk("小星%d 中心在网格 (%.0f,%.0f)" % (k, gx, gy),
            abs(gx - [10, 12, 12, 10][k - 1]) < 1e-9 and abs(gy - [2, 4, 7, 9][k - 1]) < 1e-9,
            "半径 1u = %.4f px" % u)

    # 5. 每颗小星恰有一个角尖指向大星中心
    for k, (gx, gy) in enumerate(SMALL_STARS, 1):
        sx, sy = grid_to_pixel(gx, gy, width)
        rot = small_star_rotation(gx, gy, width)
        sp = star_points(sx, sy, SMALL_R * u, rot)
        # 第 0 号顶点就是"指向大星中心"的那个外顶点
        d = math.hypot(sp[0][0] - bx, sp[0][1] - by)
        # 该顶点应在星心到大星中心连线上：距离 = |大星中心距| - 1u
        dist = math.hypot(bx - sx, by - sy)
        err_ang = abs(math.degrees(math.atan2(sp[0][1] - sy, sp[0][0] - sx)) - rot)
        err_ang = min(err_ang, 360.0 - err_ang)
        chk("小星%d 一角尖正对大星中心" % k,
            err_ang < 1e-9 and abs(d - (dist - SMALL_R * u)) < 1e-6,
            "角误差 %.2e°，尖点距大星心 %.4f u" % (err_ang, d / u))

    # 6. 全部 10 个顶点落在旗面之内（不越界）
    allpts = []
    for gx, gy in [BIG_STAR] + SMALL_STARS:
        sx, sy = grid_to_pixel(gx, gy, width)
        r = (BIG_R if (gx, gy) == BIG_STAR else SMALL_R) * u
        allpts += star_points(sx, sy, r, small_star_rotation(gx, gy, width) if (gx, gy) != BIG_STAR else 90.0)
    inside = all(-width / 2 - 1e-9 <= p[0] <= width / 2 + 1e-9 and
                 -height / 2 - 1e-9 <= p[1] <= height / 2 + 1e-9 for p in allpts)
    chk("全部五角星顶点均在旗面内", inside, "共 %d 个顶点" % len(allpts))

    # 7. 颜色
    chk("旗面红 #DE2910 / 星黄 #FFDE00", RED == "#DE2910" and YELLOW == "#FFDE00",
        "%s / %s" % (RED, YELLOW))

    return out


# ---------------------------------------------------------------- 绘制

def draw_rect(t, x, y, w, h, fill):
    """以左上角 (x, y) 画一个填充矩形。"""
    t.penup()
    t.goto(x, y)
    t.setheading(0)
    t.pendown()
    t.pensize(1)
    t.color(fill, fill)
    t.begin_fill()
    for _ in range(2):
        t.forward(w)
        t.right(90)
        t.forward(h)
        t.right(90)
    t.end_fill()


def draw_star(t, cx, cy, radius, rot_deg, animate=True, screen=None):
    """用填充多边形画一颗五角星。"""
    pts = star_points(cx, cy, radius, rot_deg)
    t.penup()
    t.goto(*pts[0])
    t.pendown()
    t.pensize(1)
    t.color(YELLOW, YELLOW)
    t.begin_fill()
    for p in pts[1:]:
        t.goto(*p)
    t.goto(*pts[0])
    t.end_fill()
    if animate and screen is not None:
        screen.update()


def draw_flag(t, width, animate=True, screen=None):
    """绘制旗面与五颗五角星，返回旗面高度。"""
    u = width / GRID_W
    height = GRID_H * u

    # ---- 旗面 ----
    draw_rect(t, -width / 2.0, height / 2.0, width, height, RED)
    if animate and screen is not None:
        screen.update()

    # ---- 大五角星：中心 (5,5)，半径 3u，一角尖朝正上 ----
    bx, by = grid_to_pixel(*BIG_STAR, width)
    draw_star(t, bx, by, BIG_R * u, 90.0, animate, screen)

    # ---- 四颗小五角星：各有一个角尖正对大星中心 ----
    for gx, gy in SMALL_STARS:
        sx, sy = grid_to_pixel(gx, gy, width)
        draw_star(t, sx, sy, SMALL_R * u, small_star_rotation(gx, gy, width), animate, screen)

    return height


def draw_grid_overlay(t, width, height):
    """叠加《国旗制法说明》里的 30x20 网格与五颗星的外接圆（教学演示用）。"""
    u = width / GRID_W
    t.pensize(1)
    t.color("#FFFFFF", "#FFFFFF")

    # 竖线（含边界）
    for i in range(int(GRID_W) + 1):
        x = -width / 2.0 + i * u
        t.penup(); t.goto(x, -height / 2.0); t.pendown()
        t.goto(x, height / 2.0)
    # 横线
    for j in range(int(GRID_H) + 1):
        y = height / 2.0 - j * u
        t.penup(); t.goto(-width / 2.0, y); t.pendown()
        t.goto(width / 2.0, y)

    # 外接圆
    t.color("#7FE3FF", "#7FE3FF")
    for gx, gy, r in [(BIG_STAR[0], BIG_STAR[1], BIG_R)] + \
                     [(a, b, SMALL_R) for a, b in SMALL_STARS]:
        cx, cy = grid_to_pixel(gx, gy, width)
        t.penup(); t.goto(cx, cy - r * u); t.setheading(0); t.pendown()
        t.circle(r * u, steps=72)

    # 星心到小星角尖的连线（说明"角尖正对大星中心"）
    t.color("#FF9D7A", "#FF9D7A")
    bx, by = grid_to_pixel(*BIG_STAR, width)
    for gx, gy in SMALL_STARS:
        sx, sy = grid_to_pixel(gx, gy, width)
        t.penup(); t.goto(sx, sy); t.pendown(); t.goto(bx, by)


def write_caption(t, width, height):
    """在旗面下方写标题。"""
    base = -height / 2.0 - MARGIN

    t.penup()
    t.color("#FFDE00")
    t.goto(0, base - 30)
    t.write("中华人民共和国国旗", align="center", font=("Microsoft YaHei", -30, "bold"))

    t.color("#FFB84D")
    t.goto(0, base - 68)
    t.write("1949 — 2026", align="center", font=("Microsoft YaHei", -20, "normal"))

    t.color("#C9D3E0")
    t.goto(0, base - 100)
    t.write("旗面 3:2 ｜ 30 × 20 格 ｜ 大星 3u ｜ 小星 1u ｜ 一角尖指向大星中心",
            align="center", font=("Microsoft YaHei", -14, "normal"))


# ---------------------------------------------------------------- 截图

def capture(screen, path):
    """把 turtle 画布区域截图保存为 PNG。"""
    try:
        from PIL import ImageGrab
    except ImportError:
        print("!! 未安装 Pillow，无法截图（pip install pillow）")
        return False

    canvas = screen.getcanvas()
    root = canvas.winfo_toplevel()
    for _ in range(3):
        root.update_idletasks()
        root.update()
        time.sleep(0.12)

    x, y = canvas.winfo_rootx(), canvas.winfo_rooty()
    w, h = canvas.winfo_width(), canvas.winfo_height()
    if w <= 1 or h <= 1:                      # 窗口尚未映射，退回整个窗口
        x, y = root.winfo_rootx(), root.winfo_rooty()
        w, h = root.winfo_width(), root.winfo_height()

    d = os.path.dirname(os.path.abspath(path))
    if d:
        os.makedirs(d, exist_ok=True)
    img = ImageGrab.grab(bbox=(x, y, x + w, y + h))
    img.save(path)
    print("截图已保存: %s  (%d x %d)" % (path, img.width, img.height))
    return True


# ---------------------------------------------------------------- 主流程

def main(argv=None):
    ap = argparse.ArgumentParser(
        description="用 turtle 绘制中华人民共和国国旗（严格国标几何）",
        formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--width", type=int, default=900, help="旗面宽度（像素），默认 900")
    ap.add_argument("--no-anim", action="store_true", help="关闭绘制动画，瞬时画完")
    ap.add_argument("--grid", action="store_true", help="叠加 30x20 国标网格与外接圆")
    ap.add_argument("--verify", action="store_true", help="只做几何自检，不打开窗口")
    ap.add_argument("--shot", type=str, default=None, help="绘制完成后截图保存到该路径")
    ap.add_argument("--keep", action="store_true", help="截图后不自动退出")
    args = ap.parse_args(argv)

    # ---- 几何自检 ----
    results = check_geometry(float(args.width))
    if args.verify:
        print("几何自检（旗宽 %d px，DPI 模式 %s）" % (args.width, DPI_MODE))
        print("-" * 72)
        bad = 0
        for name, ok, detail in results:
            print("  [%s] %-34s %s" % ("PASS" if ok else "FAIL", name, detail))
            bad += 0 if ok else 1
        print("-" * 72)
        print("%d 项检查，%d 项通过，%d 项失败" % (len(results), len(results) - bad, bad))
        return 1 if bad else 0

    width = float(args.width)
    height = width * 2.0 / 3.0
    animate = not args.no_anim

    # ---- 窗口：像素尺寸与"世界坐标"尺寸严格一致，保证不被拉伸 ----
    world_w = width + 2 * MARGIN
    world_h = height + CAPTION_H + 2 * MARGIN
    screen = Screen()
    screen.title("中华人民共和国国旗 —— Python turtle 绘制（国标几何）")
    screen.bgcolor(BACKDROP)
    screen.setup(width=int(round(world_w)), height=int(round(world_h)))
    try:
        screen.getcanvas().winfo_toplevel().tk.call("tk", "scaling", 1.0)
    except Exception:
        pass
    screen.setworldcoordinates(-world_w / 2.0, -world_h / 2.0, world_w / 2.0, world_h / 2.0)

    t = Turtle()
    t.hideturtle()
    t.speed(0 if not animate else 6)
    screen.tracer(0 if not animate else 3, 0)

    # ---- 绘制 ----
    draw_flag(t, width, animate, screen)
    if args.grid:
        draw_grid_overlay(t, width, height)
    write_caption(t, width, height)

    screen.tracer(1, 0)
    screen.update()

    u = width / GRID_W
    print("绘制完成：旗宽 %d px，旗高 %.0f px（3:2），格边长 u = %.3f px" % (width, height, u))
    print("           大星半径 3u = %.2f px，小星半径 1u = %.2f px" % (3 * u, u))
    print("           几何自检：%d 项全部通过" % len(results)
          if all(ok for _, ok, _ in results) else "           几何自检存在未通过项！")

    # ---- 截图 ----
    if args.shot:
        ok = capture(screen, args.shot)
        if not args.keep:
            try:
                screen.bye()
            except Exception:
                pass
            return 0 if ok else 1

    print("提示：点击窗口关闭，或按 Ctrl+C 结束。")
    try:
        screen.mainloop()
    except (turtle.Terminator, KeyboardInterrupt):
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
