import Cocoa
import WebKit

final class BrowserCheck: NSObject, NSApplicationDelegate, WKScriptMessageHandler {
    var window: NSWindow!
    var webView: WKWebView!
    func applicationDidFinishLaunching(_ notification: Notification) {
        let config = WKWebViewConfiguration()
        config.userContentController.add(self, name: "results")
        config.defaultWebpagePreferences.allowsContentJavaScript = true
        webView = WKWebView(frame: NSRect(x: 0, y: 0, width: 1024, height: 768), configuration: config)
        window = NSWindow(contentRect: webView.frame, styleMask: [.titled, .closable], backing: .buffered, defer: false)
        window.title = "Modal regression checks"
        window.contentView = webView
        window.orderFrontRegardless()
        let url = URL(fileURLWithPath: CommandLine.arguments[1])
        webView.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
        DispatchQueue.main.asyncAfter(deadline: .now() + 60) {
            print("FAIL: Browser checks timed out")
            exit(1)
        }
    }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        let value = String(describing: message.body)
        print(value)
        fflush(stdout)
        if value == "DONE" { exit(0) }
        if value.hasPrefix("FAIL:") { exit(1) }
    }
}
let app = NSApplication.shared
app.setActivationPolicy(.accessory)
let runner = BrowserCheck()
app.delegate = runner
app.run()
