package com.example.pokesurvivor;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PsLanPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
