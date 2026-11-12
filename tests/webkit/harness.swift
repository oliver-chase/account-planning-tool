// WebKit test harness: loads the built page in WKWebView (the engine Safari uses) and runs the JS steps
// in steps/*.js at a window of the given size, printing each step's result.
import AppKit
import WebKit

let args = CommandLine.arguments
let pagePath = args[1]
let stepsDir = args[2]
let width = CGFloat(Double(args.count > 3 ? args[3] : "390") ?? 390)
let height = CGFloat(Double(args.count > 4 ? args[4] : "844") ?? 844)

final class Harness: NSObject, WKNavigationDelegate {
    let window: NSWindow
    let web: WKWebView
    var steps: [(String, String)] = []

    override init() {
        let cfg = WKWebViewConfiguration()
        web = WKWebView(frame: NSRect(x: 0, y: 0, width: width, height: height), configuration: cfg)
        window = NSWindow(contentRect: NSRect(x: -3000, y: -3000, width: width, height: height), styleMask: [.borderless], backing: .buffered, defer: false)
        super.init()
        window.contentView = web
        web.navigationDelegate = self
        window.orderFrontRegardless()
        let names = (try? FileManager.default.contentsOfDirectory(atPath: stepsDir))?.filter { $0.hasSuffix(".js") }.sorted() ?? []
        for n in names { steps.append((n, (try? String(contentsOfFile: stepsDir + "/" + n, encoding: .utf8)) ?? "")) }
    }

    func start() {
        let url = URL(fileURLWithPath: pagePath)
        web.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
    }

    func webView(_ w: WKWebView, didFinish navigation: WKNavigation!) {
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) { self.runStep(0) }
    }

    func runStep(_ i: Int) {
        if i >= steps.count { finish(); return }
        let (name, js) = steps[i]
        web.callAsyncJavaScript(js, arguments: [:], in: nil, in: .page) { result in
            switch result {
            case .success(let v): print("== \(name)\n\(v)")
            case .failure(let e): print("== \(name) FAILED\n\(e.localizedDescription)")
            }
            self.runStep(i + 1)
        }
    }

    func finish() { exit(0) }
}

let app = NSApplication.shared
app.setActivationPolicy(.accessory)
let h = Harness()
h.start()
DispatchQueue.main.asyncAfter(deadline: .now() + 90) { print("TIMEOUT"); exit(2) }
app.run()
