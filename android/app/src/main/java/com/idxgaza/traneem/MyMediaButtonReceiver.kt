package com.idxgaza.traneem

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.media.session.MediaButtonReceiver

class MyMediaButtonReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (Intent.ACTION_MEDIA_BUTTON == intent.action) {
            val session = MediaSessionPlugin.activeSession
            if (session != null && session.isActive) {
                MediaButtonReceiver.handleIntent(session, intent)
                if (isOrderedBroadcast) {
                    abortBroadcast()
                }
            }
        }
    }
}
