import UIKit
import Capacitor
import WebKit

class ViewController: CAPBridgeViewController {
    override func viewDidLoad() {
        super.viewDidLoad()
        configureWebViewForTabletInput()
    }

    private func configureWebViewForTabletInput() {
        guard let webView = bridge?.webView else { return }

        // Keep edge swipe navigation disabled so Apple Pencil/touch canvas input is not interrupted.
        webView.allowsBackForwardNavigationGestures = false

        // Prevent iOS rubber-band scroll bounce from fighting canvas interactions.
        webView.scrollView.bounces = false
    }
}
