package com.snapkiosk

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothSocket
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.provider.Settings
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.IOException
import java.util.UUID

class SnapPrinterBluetoothModule(
  private val appContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(appContext) {
  private val sppUuid: UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")
  @Volatile private var socket: BluetoothSocket? = null
  @Volatile private var discoveryReceiver: BroadcastReceiver? = null
  @Volatile private var listenerCount = 0

  override fun getName() = "SnapPrinterBluetooth"

  private fun adapter(): BluetoothAdapter? =
    appContext.getSystemService(Context.BLUETOOTH_SERVICE)?.let { service ->
      (service as android.bluetooth.BluetoothManager).adapter
    }

  private fun emit(event: String, payload: Any?) {
    if (listenerCount < 1 || !appContext.hasActiveCatalystInstance()) return
    appContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit(event, payload)
  }

  @SuppressLint("MissingPermission")
  private fun deviceMap(device: BluetoothDevice, rssi: Int? = null) = Arguments.createMap().apply {
    putString("name", try { device.name ?: "Unknown printer" } catch (_: SecurityException) { "Unknown printer" })
    putString("address", device.address)
    putBoolean("paired", device.bondState == BluetoothDevice.BOND_BONDED)
    if (rssi != null) putInt("rssi", rssi)
  }

  @ReactMethod
  fun isSupported(promise: Promise) {
    promise.resolve(adapter() != null)
  }

  @ReactMethod
  fun isEnabled(promise: Promise) {
    try { promise.resolve(adapter()?.isEnabled == true) }
    catch (error: SecurityException) { promise.reject("BLUETOOTH_PERMISSION", error.message, error) }
  }

  @SuppressLint("MissingPermission")
  @ReactMethod
  fun getPairedDevices(promise: Promise) {
    try {
      val bluetoothAdapter = adapter()
      if (bluetoothAdapter == null) { promise.resolve(Arguments.createArray()); return }
      val devices = Arguments.createArray()
      bluetoothAdapter.bondedDevices.forEach { devices.pushMap(deviceMap(it)) }
      promise.resolve(devices)
    } catch (error: SecurityException) { promise.reject("BLUETOOTH_PERMISSION", error.message, error) }
  }

  @SuppressLint("MissingPermission")
  @ReactMethod
  fun startDiscovery(promise: Promise) {
    try {
      val bluetoothAdapter = adapter()
      if (bluetoothAdapter == null) { promise.reject("BLUETOOTH_UNAVAILABLE", "This device does not support Bluetooth."); return }
      if (!bluetoothAdapter.isEnabled) { promise.reject("BLUETOOTH_DISABLED", "Turn on Bluetooth, then scan again."); return }
      stopDiscoveryInternal()
      val filter = IntentFilter().apply {
        addAction(BluetoothDevice.ACTION_FOUND)
        addAction(BluetoothAdapter.ACTION_DISCOVERY_FINISHED)
      }
      val receiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
          when (intent?.action) {
            BluetoothDevice.ACTION_FOUND -> {
              val device = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE, BluetoothDevice::class.java)
              } else {
                @Suppress("DEPRECATION")
                intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE)
              }
              if (device != null) {
                @Suppress("DEPRECATION")
                val rssi = intent.getShortExtra(BluetoothDevice.EXTRA_RSSI, Short.MIN_VALUE).toInt()
                emit("printerDeviceFound", deviceMap(device, rssi.takeUnless { it == Short.MIN_VALUE.toInt() }))
              }
            }
            BluetoothAdapter.ACTION_DISCOVERY_FINISHED -> {
              unregisterDiscoveryReceiver()
              emit("printerDiscoveryFinished", null)
            }
          }
        }
      }
      discoveryReceiver = receiver
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        appContext.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
      } else {
        @Suppress("DEPRECATION")
        appContext.registerReceiver(receiver, filter)
      }
      if (!bluetoothAdapter.startDiscovery()) {
        unregisterDiscoveryReceiver()
        promise.reject("BLUETOOTH_SCAN_FAILED", "Android could not start Bluetooth discovery.")
      } else promise.resolve(true)
    } catch (error: SecurityException) { promise.reject("BLUETOOTH_PERMISSION", error.message, error) }
    catch (error: Exception) { promise.reject("BLUETOOTH_SCAN_FAILED", error.message, error) }
  }

  @SuppressLint("MissingPermission")
  private fun unregisterDiscoveryReceiver() {
    val receiver = discoveryReceiver ?: return
    discoveryReceiver = null
    try { appContext.unregisterReceiver(receiver) } catch (_: IllegalArgumentException) { }
  }

  @SuppressLint("MissingPermission")
  private fun stopDiscoveryInternal() {
    try { adapter()?.cancelDiscovery() } catch (_: SecurityException) { }
    unregisterDiscoveryReceiver()
  }

  @ReactMethod
  fun stopDiscovery(promise: Promise) {
    stopDiscoveryInternal()
    promise.resolve(true)
  }

  @SuppressLint("MissingPermission")
  @ReactMethod
  fun connect(address: String, promise: Promise) {
    val bluetoothAdapter = adapter()
    if (bluetoothAdapter == null) { promise.reject("BLUETOOTH_UNAVAILABLE", "This device does not support Bluetooth."); return }
    Thread {
      var candidate: BluetoothSocket? = null
      try {
        stopDiscoveryInternal()
        val device = bluetoothAdapter.getRemoteDevice(address)
        candidate = device.createRfcommSocketToServiceRecord(sppUuid)
        candidate.connect()
        socket?.close()
        socket = candidate
        val result = deviceMap(device).apply { putBoolean("connected", true) }
        promise.resolve(result)
      } catch (error: Exception) {
        try { candidate?.close() } catch (_: IOException) { }
        promise.reject("BLUETOOTH_CONNECT_FAILED", error.message ?: "Could not connect to this printer.", error)
      }
    }.start()
  }

  @ReactMethod
  fun disconnect(promise: Promise) {
    Thread {
      try { socket?.close(); socket = null; promise.resolve(true) }
      catch (error: Exception) { socket = null; promise.reject("BLUETOOTH_DISCONNECT_FAILED", error.message, error) }
    }.start()
  }

  @ReactMethod
  fun writeBytes(bytes: ReadableArray, promise: Promise) {
    val activeSocket = socket
    if (activeSocket == null || !activeSocket.isConnected) {
      promise.reject("PRINTER_NOT_CONNECTED", "Connect a printer before sending a test print.")
      return
    }
    Thread {
      try {
        val payload = ByteArray(bytes.size()) { index -> bytes.getInt(index).toByte() }
        activeSocket.outputStream.apply {
          write(payload)
          flush()
        }
        promise.resolve(true)
      } catch (error: Exception) {
        try { activeSocket.close() } catch (_: IOException) { }
        if (socket === activeSocket) socket = null
        promise.reject("PRINTER_WRITE_FAILED", error.message ?: "Could not send data to the printer.", error)
      }
    }.start()
  }

  @ReactMethod
  fun openBluetoothSettings(promise: Promise) {
    try {
      val intent = Intent(Settings.ACTION_BLUETOOTH_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      appContext.startActivity(intent)
      promise.resolve(true)
    } catch (error: Exception) { promise.reject("BLUETOOTH_SETTINGS_FAILED", error.message, error) }
  }

  @ReactMethod fun addListener(eventName: String) { listenerCount += 1 }
  @ReactMethod fun removeListeners(count: Int) { listenerCount = (listenerCount - count).coerceAtLeast(0) }
}
