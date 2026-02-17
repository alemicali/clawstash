class Clawstash < Formula
  desc "Encrypted incremental backups for ~/.openclaw"
  homepage "https://clawstash.io"
  url "https://registry.npmjs.org/clawstash/-/clawstash-0.1.0.tgz"
  sha256 "" # TODO: fill after first npm publish
  license "MIT"

  depends_on "node"

  def install
    system "npm", "install", *std_npm_args
    bin.install_symlink libexec.glob("bin/*")
  end

  def post_install
    ohai "Run `clawstash setup` to configure your first backup"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/clawstash --version")
  end
end
