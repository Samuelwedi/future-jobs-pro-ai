import React from 'react';
import { Navigate } from 'react-router-dom';

// Voice is now part of Ask Lucy. Preserve the old route for bookmarks.
export default function VoiceAssistant() {
  return <Navigate to="/ask-lucy" replace />;
}
