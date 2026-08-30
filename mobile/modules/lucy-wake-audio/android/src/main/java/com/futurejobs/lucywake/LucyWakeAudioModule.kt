package com.futurejobs.lucywake

import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.util.Base64
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlin.concurrent.thread

class LucyWakeAudioModule : Module() {
  @Volatile
  private var running = false

  @Volatile
  private var recorder: AudioRecord? = null

  private var worker: Thread? = null

  override fun definition() = ModuleDefinition {
    Name("LucyWakeAudio")
    Events("onAudioFrame")

    AsyncFunction("start") {
      if (!running) {
        val minimum = AudioRecord.getMinBufferSize(
          SAMPLE_RATE,
          AudioFormat.CHANNEL_IN_MONO,
          AudioFormat.ENCODING_PCM_16BIT
        )

        if (minimum <= 0) {
          throw IllegalStateException(
            "Lucy could not determine a valid microphone buffer size."
          )
        }

        val audioRecord = AudioRecord(
          MediaRecorder.AudioSource.VOICE_RECOGNITION,
          SAMPLE_RATE,
          AudioFormat.CHANNEL_IN_MONO,
          AudioFormat.ENCODING_PCM_16BIT,
          maxOf(minimum, BUFFER_SIZE)
        )

        if (audioRecord.state != AudioRecord.STATE_INITIALIZED) {
          audioRecord.release()
          throw IllegalStateException(
            "Lucy could not initialize the microphone."
          )
        }

        audioRecord.startRecording()

        recorder = audioRecord
        running = true

        worker = thread(
          name = "LucyWakeAudio",
          isDaemon = true
        ) {
          val buffer = ByteArray(BUFFER_SIZE)

          try {
            while (running && !Thread.currentThread().isInterrupted) {
              val count = audioRecord.read(
                buffer,
                0,
                buffer.size
              )

              if (count > 0 && running) {
                sendEvent(
                  "onAudioFrame",
                  mapOf(
                    "pcm16Base64" to Base64.encodeToString(
                      buffer,
                      0,
                      count,
                      Base64.NO_WRAP
                    ),
                    "sampleRate" to SAMPLE_RATE
                  )
                )
              } else if (count < 0) {
                break
              }
            }
          } catch (_: IllegalStateException) {
            // The recorder may be stopped while the read loop is active.
          }
        }
      }

      null
    }

    AsyncFunction("stop") {
      running = false

      val activeRecorder = recorder
      recorder = null

      try {
        if (
          activeRecorder?.recordingState ==
          AudioRecord.RECORDSTATE_RECORDING
        ) {
          activeRecorder.stop()
        }
      } catch (_: IllegalStateException) {
        // Recorder was already stopped.
      }

      worker?.interrupt()

      try {
        worker?.join(250)
      } catch (_: InterruptedException) {
        Thread.currentThread().interrupt()
      }

      worker = null
      activeRecorder?.release()

      null
    }
  }

  companion object {
    private const val SAMPLE_RATE = 16000
    private const val BUFFER_SIZE = 2560
  }
}