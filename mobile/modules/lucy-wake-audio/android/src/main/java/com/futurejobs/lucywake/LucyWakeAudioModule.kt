package com.futurejobs.lucywake

import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.util.Base64
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlin.concurrent.thread

class LucyWakeAudioModule : Module() {
  @Volatile private var running = false
  private var recorder: AudioRecord? = null

  override fun definition() = ModuleDefinition {
    Name("LucyWakeAudio")
    Events("onAudioFrame")

    AsyncFunction("start") {
      if (running) return@AsyncFunction
      val minimum = AudioRecord.getMinBufferSize(16000, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
      recorder = AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION, 16000, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, maxOf(minimum, 4096))
      recorder!!.startRecording()
      running = true
      thread(name = "LucyWakeAudio", isDaemon = true) {
        val buffer = ByteArray(2560)
        while (running) {
          val count = recorder?.read(buffer, 0, buffer.size) ?: -1
          if (count > 0) sendEvent("onAudioFrame", mapOf("pcm16Base64" to Base64.encodeToString(buffer, 0, count, Base64.NO_WRAP), "sampleRate" to 16000))
        }
      }
    }

    AsyncFunction("stop") {
      running = false
      recorder?.stop()
      recorder?.release()
      recorder = null
    }
  }
}
