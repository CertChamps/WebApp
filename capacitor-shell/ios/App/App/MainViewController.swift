import Capacitor
import StoreKit
import UIKit

class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(ShareBridgePlugin())
        bridge?.registerPluginInstance(SubscriptionManagementPlugin())
    }
}

// Kept in this target's existing source file so Xcode includes it in every build.
@objc(SubscriptionManagementPlugin)
public class SubscriptionManagementPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SubscriptionManagementPlugin"
    public let jsName = "SubscriptionManagement"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "open", returnType: CAPPluginReturnPromise),
    ]

    @objc func open(_ call: CAPPluginCall) {
        Task { @MainActor in
            guard let scene = self.bridge?.viewController?.view.window?.windowScene else {
                call.reject("Could not open subscription settings. Please try again.")
                return
            }
            do {
                try await AppStore.showManageSubscriptions(in: scene)
                call.resolve()
            } catch {
                call.reject("Could not open subscription settings.", nil, error)
            }
        }
    }
}
