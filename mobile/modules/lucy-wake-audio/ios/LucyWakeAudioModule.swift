import ExpoModulesCore
import AVFoundation

public final class LucyWakeAudioModule: Module {
  private let engine = AVAudioEngine()
  private let stateLock = NSLock()
  private var converter: AVAudioConverter?
  private var running = false

  public func definition() -> ModuleDefinition {
    Name("LucyWakeAudio")
    Events("onAudioFrame")

    AsyncFunction("start") {
      self.stateLock.lock()
      if self.running {
        self.stateLock.unlock()
        return
      }
      self.stateLock.unlock()

      let session = AVAudioSession.sharedInstance()
      guard session.recordPermission == .granted else {
        throw NSError(
          domain: "LucyWakeAudio",
          code: 2,
          userInfo: [NSLocalizedDescriptionKey: "Microphone permission is required for Hey Lucy."]
        )
      }

      try session.setCategory(.record, mode: .measurement, options: [.duckOthers])
      try session.setPreferredSampleRate(16000)
      try session.setPreferredIOBufferDuration(0.08)
      try session.setActive(true)

      let input = self.engine.inputNode
      let source = input.outputFormat(forBus: 0)
      guard source.sampleRate > 0, source.channelCount > 0 else {
        throw NSError(
          domain: "LucyWakeAudio",
          code: 3,
          userInfo: [NSLocalizedDescriptionKey: "The iPhone microphone has no available input format."]
        )
      }
      guard let target = AVAudioFormat(
        commonFormat: .pcmFormatInt16,
        sampleRate: 16000,
        channels: 1,
        interleaved: true
      ) else {
        throw NSError(domain: "LucyWakeAudio", code: 4)
      }
      guard let converter = AVAudioConverter(from: source, to: target) else {
        throw NSError(
          domain: "LucyWakeAudio",
          code: 5,
          userInfo: [NSLocalizedDescriptionKey: "Lucy could not create the iOS audio converter."]
        )
      }

      self.converter = converter
      input.removeTap(onBus: 0)
      input.installTap(onBus: 0, bufferSize: 2048, format: source) { [weak self] buffer, _ in
        guard let self = self else { return }
        self.stateLock.lock()
        let isRunning = self.running
        self.stateLock.unlock()
        guard isRunning, let activeConverter = self.converter else { return }

        let capacity = AVAudioFrameCount(
          Double(buffer.frameLength) * 16000.0 / source.sampleRate
        ) + 1
        guard let output = AVAudioPCMBuffer(pcmFormat: target, frameCapacity: capacity) else { return }
        var supplied = false
        var conversionError: NSError?
        let status = activeConverter.convert(to: output, error: &conversionError) { _, statusPointer in
          if supplied {
            statusPointer.pointee = .noDataNow
            return nil
          }
          supplied = true
          statusPointer.pointee = .haveData
          return buffer
        }
        guard status != .error,
              conversionError == nil,
              output.frameLength > 0,
              let channelData = output.int16ChannelData else { return }

        let bytes = Data(bytes: channelData[0], count: Int(output.frameLength) * 2)
        self.sendEvent("onAudioFrame", [
          "pcm16Base64": bytes.base64EncodedString(),
          "sampleRate": 16000
        ])
      }

      self.engine.prepare()
      try self.engine.start()
      self.stateLock.lock()
      self.running = true
      self.stateLock.unlock()
    }

    AsyncFunction("stop") {
      self.stateLock.lock()
      let wasRunning = self.running
      self.running = false
      self.stateLock.unlock()
      guard wasRunning else { return }

      self.engine.inputNode.removeTap(onBus: 0)
      self.engine.stop()
      self.converter = nil
      try? AVAudioSession.sharedInstance().setActive(
        false,
        options: [.notifyOthersOnDeactivation]
      )
    }

    OnDestroy {
      self.stateLock.lock()
      let wasRunning = self.running
      self.running = false
      self.stateLock.unlock()
      if wasRunning {
        self.engine.inputNode.removeTap(onBus: 0)
        self.engine.stop()
      }
      self.converter = nil
    }
  }
}
