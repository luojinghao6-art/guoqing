// Package main 是国庆贺卡 Linux 一键运行版。
// 用 go:embed 把 web/ 全部静态资源编译进单个二进制，
// 监听 55633 端口并提供 HTTP 服务，随后自动打开浏览器。
package main

import (
	"embed"
	"fmt"
	"io/fs"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"time"
)

//go:embed all:web
var webFS embed.FS

func main() {
	port := getenv("PORT", "55633")
	host := getenv("HOST", "127.0.0.1")

	addr := net.JoinHostPort(host, port)
	ln, err := net.Listen("tcp", addr)
	if err != nil {
		fmt.Fprintln(os.Stderr, "启动失败：", err)
		os.Exit(1)
	}

	// 打开浏览器
	if getenv("NO_OPEN", "") != "1" {
		openBrowser("http://" + addr + "/")
	}

	fmt.Println("==============================================")
	fmt.Println("  我爱你中国 · 国庆主题贺卡（Linux 一键运行版）")
	fmt.Println("  服务地址: http://" + addr + "/")
	fmt.Println("  交互: 点击放烟花 / 空格暂停 / R 重播 / G 网格 / F 全屏")
	fmt.Println("  按 Ctrl+C 退出")
	fmt.Println("==============================================")

	srv := &http.Server{
		Handler:           handler(),
		ReadHeaderTimeout: 10 * time.Second,
	}
	log.Fatal(srv.Serve(ln))
}

func handler() http.Handler {
	sub, err := fs.Sub(webFS, "web")
	if err != nil {
		panic(err)
	}
	fileServer := http.FileServer(http.FS(sub))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p := r.URL.Path
		if p == "/" {
			p = "/index.html"
		}
		// 避免目录列表，直接落到文件
		if strings.HasSuffix(p, "/") {
			http.NotFound(w, r)
			return
		}
		fileServer.ServeHTTP(w, r)
	})
}

func openBrowser(url string) {
	switch runtime.GOOS {
	case "linux":
		for _, b := range []string{"xdg-open", "gio", "gnome-open", "kde-open"} {
			if _, err := exec.LookPath(b); err == nil {
				_ = exec.Command(b, url).Start()
				return
			}
		}
	case "darwin":
		_ = exec.Command("open", url).Start()
	default:
		_ = exec.Command("rundll32", "url.dll,FileProtocolHandler", url).Start()
	}
}

func getenv(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
