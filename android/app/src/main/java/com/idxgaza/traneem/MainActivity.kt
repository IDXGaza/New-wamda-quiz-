package com.idxgaza.traneem

import android.os.Bundle
import com.codetrixstudio.capacitor.GoogleAuth.GoogleAuth
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(GoogleAuth::class.java)
        registerPlugin(MediaSessionPlugin::class.java)
        super.onCreate(savedInstanceState)
    }
}
