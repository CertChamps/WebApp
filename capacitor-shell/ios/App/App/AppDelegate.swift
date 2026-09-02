import UIKit
import WebKit
import Capacitor
import GoogleSignIn

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate, UIPencilInteractionDelegate {

    var window: UIWindow?
    private var pencilInteraction: UIPencilInteraction?
    private var lastPencilTapTime: TimeInterval = 0

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Override point for customization after application launch.
        DispatchQueue.main.async { [weak self] in
            self?.installPencilInteractionIfNeeded()
            self?.configureWebViewIfNeeded()
        }
        return true
    }

    /// Lock iPad to horizontal orientations (matches `UISupportedInterfaceOrientations~ipad` in Info.plist).
    /// Ensures the window does not follow child view controllers that advertise portrait.
    // func application(_ application: UIApplication, supportedInterfaceOrientationsFor window: UIWindow?) -> UIInterfaceOrientationMask {
    //     if UIDevice.current.userInterfaceIdiom == .pad {
    //         return [.landscapeLeft, .landscapeRight]
    //     }
    //     return [.portrait, .landscapeLeft, .landscapeRight]
    // }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
        installPencilInteractionIfNeeded()
        configureWebViewIfNeeded()
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Give Google Sign-In first crack at the URL (returned from the
        // Google auth web flow after the user picks an account).
        if GIDSignIn.sharedInstance.handle(url) {
            return true
        }
        // Fall through to Capacitor for everything else (deep links, etc.).
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }

    func application(_ application: UIApplication, didReceiveRemoteNotification userInfo: [AnyHashable: Any], fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void) {
        NotificationCenter.default.post(name: Notification.Name("didReceiveRemoteNotification"), object: completionHandler, userInfo: userInfo)
    }

    private func installPencilInteractionIfNeeded() {
        guard UIDevice.current.userInterfaceIdiom == .pad,
              pencilInteraction == nil,
              let rootView = window?.rootViewController?.view else { return }

        let interaction = UIPencilInteraction()
        interaction.delegate = self
        rootView.addInteraction(interaction)
        pencilInteraction = interaction
    }

    /// Stop Apple Pencil from panning the WKWebView itself. Finger scrolling in
    /// inner overflow:auto regions is unchanged; JS preventDefault covers those.
    private func configureWebViewIfNeeded() {
        guard let rootView = window?.rootViewController?.view,
              let webView = findWebView(in: rootView) else { return }

        let scrollView = webView.scrollView
        scrollView.bounces = false
        scrollView.alwaysBounceVertical = false
        scrollView.alwaysBounceHorizontal = false
        scrollView.keyboardDismissMode = .none
        if #available(iOS 11.0, *) {
            scrollView.contentInsetAdjustmentBehavior = .never
        }
        scrollView.panGestureRecognizer.allowedTouchTypes = [
            NSNumber(value: UITouch.TouchType.direct.rawValue)
        ]
    }

    private func dispatchWebEvent(_ name: String) {
        guard let rootView = window?.rootViewController?.view,
              let webView = findWebView(in: rootView) else { return }
        webView.evaluateJavaScript("window.dispatchEvent(new Event('\(name)'));", completionHandler: nil)
    }

    private func findWebView(in view: UIView) -> WKWebView? {
        if let webView = view as? WKWebView { return webView }
        for subview in view.subviews {
            if let webView = findWebView(in: subview) { return webView }
        }
        return nil
    }

    // Supports Apple Pencil double-tap on iPadOS 15 through 17.4.
    func pencilInteractionDidTap(_ interaction: UIPencilInteraction) {
        dispatchPencilDoubleTap()
    }

    @available(iOS 17.5, *)
    func pencilInteraction(_ interaction: UIPencilInteraction, didReceiveTap tap: UIPencilInteraction.Tap) {
        dispatchPencilDoubleTap()
    }

    @available(iOS 17.5, *)
    func pencilInteraction(_ interaction: UIPencilInteraction, didReceiveSqueeze squeeze: UIPencilInteraction.Squeeze) {
        guard squeeze.phase == .ended else { return }
        dispatchWebEvent("certchamps:pencil-squeeze")
    }

    private func dispatchPencilDoubleTap() {
        // Newer SDKs may also surface the deprecated callback; suppress duplicates.
        let now = ProcessInfo.processInfo.systemUptime
        guard now - lastPencilTapTime > 0.25 else { return }
        lastPencilTapTime = now
        dispatchWebEvent("certchamps:pencil-double-tap")
    }

}
