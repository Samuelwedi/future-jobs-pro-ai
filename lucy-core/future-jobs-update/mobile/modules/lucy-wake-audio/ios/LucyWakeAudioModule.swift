import ExpoModulesCore
import AVFoundation

public final class LucyWakeAudioModule: Module {
  private let engine = AVAudioEngine()
  private var converter: AVAudioConverter?

  public func definition() -> ModuleDefinition {
    Name("LucyWakeAudio")
    Events("onAudioFrame")

    AsyncFunction("start") {
      let session = AVAudioSession.sharedInstance()
      try session.setCategory(.record, mode: .measurement, options: [.duckOthers])
      try session.setActive(true)
      let input = self.engine.inputNode
      let source = input.outputFormat(forBus: 0)
      guard let target = AVAudioFormat(commonFormat: .pcmFormatInt16, sampleRate: 16000, channels: 1, interleaved: true) else {
        throw NSError(domain: "LucyWakeAudio", code: 1)
      }
      self.converter = AVAudioConverter(from: source, to: target)
      input.installTap(onBus: 0, bufferSize: 4096, format: source) { buffer, _ in
        guard let converter = self.converter else { return }
        let capacity = AVAudioFrameCount(Double(buffer.frameLength) * 16000.0 / source.sampleRate) + 1
        guard let output = AVAudioPCMBuffer(pcmFormat: target, frameCapacity: capacity) else { return }
        var supplied = false
        var error: NSError?
        converter.convert(to: output, error: &error) { _, status in
          if supplied { status.pointee = .noDataNow; return nil }
          supplied = true; status.pointee = .haveData; return buffer
        }
        guard error == nil, let data = output.int16ChannelData else { return }
        let bytes = Data(bytes: data[0], count: Int(output.frameLength) * 2)
        self.sendEvent("onAudioFrame", ["pcm16Base64": bytes.base64EncodedString(), "sampleRate": 16000])
      }
      self.engine.prepare()
      try self.engine.start()
    }

    AsyncFunction("stop") {
      self.engine.inputNode.removeTap(onBus: 0)
      self.engine.stop()
      try? AVAudioSession.sharedInstance().setActive(false)
    }
  }
}
