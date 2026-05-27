require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "shaheen"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = package["homepage"] || "https://github.com/developer/shaheen"
  s.license      = package["license"]
  s.authors      = package["author"]

  s.platforms    = { :ios => "13.4" }
  s.source       = { :git => "https://github.com/developer/shaheen.git", :tag => "#{s.version}" }

  s.source_files = "ios/**/*.{h,m,mm}", "cpp/**/*.{h,cpp}"

  # Intercept compilation pipeline to invoke Cargo toolchain before XCode links compilation static libraries
  s.prepare_command = <<-CMD
    cd rust
    cargo build --target aarch64-apple-ios --release
  CMD

  s.pod_target_xcconfig = {
    'OTHER_LDFLAGS' => '-L$(PODS_TARGET_SRCROOT)/rust/target/aarch64-apple-ios/release -lshaheen_core'
  }

  install_modules_dependencies(s)
end
