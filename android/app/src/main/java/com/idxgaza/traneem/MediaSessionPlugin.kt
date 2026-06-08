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

    private var mediaSession: MediaSessionCompat? = null
    private val CHANNEL_ID = "traneem_media"
    private val NOTIFICATION_ID = 1

    override fun load() {
        createNotificationChannel()
        mediaSession = MediaSessionCompat(context, "TraneemMediaSession").apply {
            setCallback(object : MediaSessionCompat.Callback() {
                override fun onPlay() {
                    notifyListeners("mediaAction", JSObject().apply { put("action", "play") })
                }
                override fun onPause() {
                    notifyListeners("mediaAction", JSObject().apply { put("action", "pause") })
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
            isActive = true
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

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    val focusRequest = android.media.AudioFocusRequest.Builder(android.media.AudioManager.AUDIOFOCUS_GAIN)
                        .setAudioAttributes(
                            android.media.AudioAttributes.Builder()
                                .setUsage(android.media.AudioAttributes.USAGE_MEDIA)
                                .setContentType(android.media.AudioAttributes.CONTENT_TYPE_MUSIC)
                                .build()
                        )
                        .build()
                    audioManager.requestAudioFocus(focusRequest)
                } else {
                    @Suppress("DEPRECATION")
                    audioManager.requestAudioFocus(null, android.media.AudioManager.STREAM_MUSIC, android.media.AudioManager.AUDIOFOCUS_GAIN)
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
        val state = if (isPlaying) PlaybackStateCompat.STATE_PLAYING else PlaybackStateCompat.STATE_PAUSED
        val playbackState = PlaybackStateCompat.Builder()
            .setActions(
                PlaybackStateCompat.ACTION_PLAY or
                PlaybackStateCompat.ACTION_PAUSE or
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
            Intent("com.idxgaza.traneem.MEDIA_PREVIOUS"),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val playPauseIntent = PendingIntent.getBroadcast(
            context, 1,
            Intent("com.idxgaza.traneem.MEDIA_PLAY_PAUSE"),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val nextIntent = PendingIntent.getBroadcast(
            context, 2,
            Intent("com.idxgaza.traneem.MEDIA_NEXT"),
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
        mediaSession?.release()
        mediaSession = null
    }
}
