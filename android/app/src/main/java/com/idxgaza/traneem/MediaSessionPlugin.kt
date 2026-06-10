package com.idxgaza.traneem

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Build
import android.support.v4.media.MediaMetadataCompat
import android.support.v4.media.session.MediaSessionCompat
import android.support.v4.media.session.PlaybackStateCompat
import androidx.core.app.NotificationCompat
import androidx.media.app.NotificationCompat.MediaStyle
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.net.URL

@CapacitorPlugin(name = "MediaSession")
class MediaSessionPlugin : Plugin() {

    companion object {
        var activeSession: MediaSessionCompat? = null
        var activePlugin: MediaSessionPlugin? = null
    }

    private var mediaSession: MediaSessionCompat? = null
    private val CHANNEL_ID = "traneem_media"
    private val NOTIFICATION_ID = 1
    private var audioFocusRequest: android.media.AudioFocusRequest? = null

    private val receiver = object : android.content.BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            val action = intent?.action ?: return
            when (action) {
                "com.idxgaza.traneem.MEDIA_PREVIOUS" -> {
                    notifyListeners("mediaAction", JSObject().apply { put("action", "previous") })
                }
                "com.idxgaza.traneem.MEDIA_PLAY_PAUSE" -> {
                    notifyListeners("mediaAction", JSObject().apply { put("action", "toggle") })
                }
                "com.idxgaza.traneem.MEDIA_NEXT" -> {
                    notifyListeners("mediaAction", JSObject().apply { put("action", "next") })
                }
            }
        }
    }

    override fun load() {
        createNotificationChannel()
        
        mediaSession = MediaSessionCompat(context, "TraneemMediaSession").apply {
            setCallback(object : MediaSessionCompat.Callback() {
                override fun onPlay() {
                    notifyListeners("mediaAction", JSObject().apply { put("action", "toggle") })
                }
                override fun onPause() {
                    notifyListeners("mediaAction", JSObject().apply { put("action", "toggle") })
                }
                override fun onSkipToNext() {
                    notifyListeners("mediaAction", JSObject().apply { put("action", "next") })
                }
                override fun onSkipToPrevious() {
                    notifyListeners("mediaAction", JSObject().apply { put("action", "previous") })
                }
                override fun onStop() {
                    notifyListeners("mediaAction", JSObject().apply { put("action", "stop") })
                }
            })
            setFlags(
                MediaSessionCompat.FLAG_HANDLES_MEDIA_BUTTONS or
                MediaSessionCompat.FLAG_HANDLES_TRANSPORT_CONTROLS
            )
            isActive = true
        }
        activeSession = mediaSession
        activePlugin = this
        updatePlaybackState(false)

        val filter = android.content.IntentFilter().apply {
            addAction("com.idxgaza.traneem.MEDIA_PREVIOUS")
            addAction("com.idxgaza.traneem.MEDIA_PLAY_PAUSE")
            addAction("com.idxgaza.traneem.MEDIA_NEXT")
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            context.registerReceiver(receiver, filter, Context.RECEIVER_EXPORTED)
        } else {
            context.registerReceiver(receiver, filter)
        }
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "ترانيم - تشغيل الصوت",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "إشعار التحكم في تشغيل الأناشيد"
                setShowBadge(false)
            }
            val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            nm.createNotificationChannel(channel)
        }
    }

    @PluginMethod
    fun updateMetadata(call: PluginCall) {
        val title = call.getString("title") ?: "ترانيم"
        val artist = call.getString("artist") ?: ""
        val artworkUrl = call.getString("artworkUrl") ?: ""
        val isPlaying = call.getBoolean("isPlaying") ?: false

        Thread {
            var bitmap: Bitmap? = null
            if (artworkUrl.isNotEmpty() && artworkUrl.startsWith("http")) {
                try {
                    bitmap = BitmapFactory.decodeStream(URL(artworkUrl).openStream())
                } catch (e: Exception) {
                    // استمر بدون صورة
                }
            }
            val finalBitmap = bitmap
            activity.runOnUiThread {
                val metadata = MediaMetadataCompat.Builder()
                    .putString(MediaMetadataCompat.METADATA_KEY_TITLE, title)
                    .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, artist)
                    .apply { if (finalBitmap != null) putBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART, finalBitmap) }
                    .build()
                mediaSession?.setMetadata(metadata)
                updatePlaybackState(isPlaying)

                val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as android.media.AudioManager

                if (isPlaying) {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        val focusRequest = android.media.AudioFocusRequest.Builder(android.media.AudioManager.AUDIOFOCUS_GAIN)
                            .setAudioAttributes(
                                android.media.AudioAttributes.Builder()
                                    .setUsage(android.media.AudioAttributes.USAGE_MEDIA)
                                    .setContentType(android.media.AudioAttributes.CONTENT_TYPE_MUSIC)
                                    .build()
                            )
                            .setWillPauseWhenDucked(true)
                            .setAcceptsDelayedFocusGain(true)
                            .setOnAudioFocusChangeListener { focusChange ->
                                when (focusChange) {
                                    android.media.AudioManager.AUDIOFOCUS_LOSS,
                                    android.media.AudioManager.AUDIOFOCUS_LOSS_TRANSIENT -> {
                                        activity.runOnUiThread {
                                            notifyListeners("mediaAction", JSObject().apply { put("action", "pause") })
                                        }
                                    }
                                    android.media.AudioManager.AUDIOFOCUS_GAIN -> {
                                        activity.runOnUiThread {
                                            notifyListeners("mediaAction", JSObject().apply { put("action", "play") })
                                        }
                                    }
                                }
                            }
                            .build()
                        audioFocusRequest = focusRequest
                        audioManager.requestAudioFocus(focusRequest)
                    } else {
                        @Suppress("DEPRECATION")
                        audioManager.requestAudioFocus(
                            { focusChange ->
                                when (focusChange) {
                                    android.media.AudioManager.AUDIOFOCUS_LOSS,
                                    android.media.AudioManager.AUDIOFOCUS_LOSS_TRANSIENT -> {
                                        activity.runOnUiThread {
                                            notifyListeners("mediaAction", JSObject().apply { put("action", "pause") })
                                        }
                                    }
                                    android.media.AudioManager.AUDIOFOCUS_GAIN -> {
                                        activity.runOnUiThread {
                                            notifyListeners("mediaAction", JSObject().apply { put("action", "play") })
                                        }
                                    }
                                }
                            },
                            android.media.AudioManager.STREAM_MUSIC,
                            android.media.AudioManager.AUDIOFOCUS_GAIN
                        )
                    }
                } else {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        audioFocusRequest?.let {
                            audioManager.abandonAudioFocusRequest(it)
                            audioFocusRequest = null
                        }
                    } else {
                        @Suppress("DEPRECATION")
                        audioManager.abandonAudioFocus(null)
                    }
                }

                showNotification(title, artist, finalBitmap, isPlaying)
            }
        }.start()
        call.resolve()
    }

    @PluginMethod
    fun updatePlaybackState(call: PluginCall) {
        val isPlaying = call.getBoolean("isPlaying") ?: false
        updatePlaybackState(isPlaying)
        call.resolve()
    }

    private fun updatePlaybackState(isPlaying: Boolean) {
        mediaSession?.isActive = isPlaying
        val state = if (isPlaying) PlaybackStateCompat.STATE_PLAYING else PlaybackStateCompat.STATE_PAUSED
        val playbackState = PlaybackStateCompat.Builder()
            .setActions(
                PlaybackStateCompat.ACTION_PLAY or
                PlaybackStateCompat.ACTION_PAUSE or
                PlaybackStateCompat.ACTION_PLAY_PAUSE or
                PlaybackStateCompat.ACTION_SKIP_TO_NEXT or
                PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS or
                PlaybackStateCompat.ACTION_STOP
            )
            .setState(state, PlaybackStateCompat.PLAYBACK_POSITION_UNKNOWN, 1f)
            .build()
        mediaSession?.setPlaybackState(playbackState)
    }

    private fun showNotification(title: String, artist: String, artwork: Bitmap?, isPlaying: Boolean) {
        val token = mediaSession?.sessionToken ?: return

        val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)
        val pendingIntent = PendingIntent.getActivity(
            context, 0, launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val prevIntent = PendingIntent.getBroadcast(
            context, 0,
            Intent("com.idxgaza.traneem.MEDIA_PREVIOUS").apply { setPackage(context.packageName) },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val playPauseIntent = PendingIntent.getBroadcast(
            context, 1,
            Intent("com.idxgaza.traneem.MEDIA_PLAY_PAUSE").apply { setPackage(context.packageName) },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val nextIntent = PendingIntent.getBroadcast(
            context, 2,
            Intent("com.idxgaza.traneem.MEDIA_NEXT").apply { setPackage(context.packageName) },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val playPauseIcon = if (isPlaying) android.R.drawable.ic_media_pause else android.R.drawable.ic_media_play

        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(artist)
            .setContentIntent(pendingIntent)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOnlyAlertOnce(true)
            .setOngoing(isPlaying)
            .apply { if (artwork != null) setLargeIcon(artwork) }
            .addAction(android.R.drawable.ic_media_previous, "السابق", prevIntent)
            .addAction(playPauseIcon, if (isPlaying) "إيقاف" else "تشغيل", playPauseIntent)
            .addAction(android.R.drawable.ic_media_next, "التالي", nextIntent)
            .setStyle(
                MediaStyle()
                    .setMediaSession(token)
                    .setShowActionsInCompactView(0, 1, 2)
            )
            .build()

        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.notify(NOTIFICATION_ID, notification)
    }

    @PluginMethod
    fun hideNotification(call: PluginCall) {
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.cancel(NOTIFICATION_ID)
        call.resolve()
    }

    override fun handleOnDestroy() {
        if (activePlugin == this) activePlugin = null
        if (activeSession == mediaSession) activeSession = null
        try {
            context.unregisterReceiver(receiver)
        } catch (e: Exception) {
            // Ignore if not registered
        }
        mediaSession?.release()
        mediaSession = null
    }
}
