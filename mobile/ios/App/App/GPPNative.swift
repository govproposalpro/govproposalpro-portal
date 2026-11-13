import UIKit
import WebKit
import Capacitor

/// The app's main screen: Capacitor's web view showing the live Command Center, plus
/// pull-to-refresh and the native print plugin below.
class AppViewController: CAPBridgeViewController {
    private let refresher = UIRefreshControl()

    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(NativePrintPlugin())
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 4 / 255, green: 5 / 255, blue: 10 / 255, alpha: 1)
        guard let webView = webView else { return }
        webView.isOpaque = false
        webView.backgroundColor = view.backgroundColor
        webView.scrollView.backgroundColor = view.backgroundColor
        // Pull down at the top of any page to reload it.
        refresher.tintColor = .white
        refresher.addTarget(self, action: #selector(reloadPage), for: .valueChanged)
        webView.scrollView.refreshControl = refresher
        webView.scrollView.bounces = true
    }

    @objc private func reloadPage() {
        webView?.reload()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) { [weak self] in
            self?.refresher.endRefreshing()
        }
    }
}

/// window.print() does nothing in an iOS web view, so the web app calls this instead
/// (frontend/app/tools/05-native.js). It opens the iOS print sheet for the current page, where
/// members can print or pinch out to save the proposal as a PDF.
@objc(NativePrintPlugin)
public class NativePrintPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NativePrintPlugin"
    public let jsName = "NativePrint"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "printPage", returnType: CAPPluginReturnPromise)
    ]

    @objc func printPage(_ call: CAPPluginCall) {
        let name = call.getString("name") ?? "GovProposalPro"
        DispatchQueue.main.async {
            guard let webView = self.bridge?.webView else {
                call.reject("The page is not ready yet.")
                return
            }
            let info = UIPrintInfo(dictionary: nil)
            info.outputType = .general
            info.jobName = name
            let printer = UIPrintInteractionController.shared
            printer.printInfo = info
            printer.printFormatter = webView.viewPrintFormatter()
            printer.present(animated: true) { _, completed, error in
                if let error = error {
                    call.reject(error.localizedDescription)
                } else {
                    call.resolve(["completed": completed])
                }
            }
        }
    }
}
