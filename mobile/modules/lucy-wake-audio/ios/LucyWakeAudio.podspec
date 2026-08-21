Pod::Spec.new do |s|
  s.name           = 'LucyWakeAudio'
  s.version        = '1.0.0'
  s.summary        = 'Local audio capture for the Lucy wake-word engine.'
  s.description    = 'An offline Expo native module that streams microphone audio to the Lucy wake-word detector.'
  s.license        = { :type => 'MIT' }
  s.author         = { 'Future Jobs Pro AI' => 'support@futurejobsproai.com' }
  s.homepage       = 'https://www.futurejobsproai.com'
  s.platforms      = { :ios => '16.0' }
  s.swift_version  = '5.9'
  s.source         = {
    :git => 'https://github.com/Samuelwedi/future-jobs-pro-ai.git'
  }

  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.{h,m,mm,swift,hpp,cpp}'
end