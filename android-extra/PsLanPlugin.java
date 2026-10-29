package com.example.pokesurvivor;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.NetworkInterface;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

@CapacitorPlugin(name = "PsLan")
public class PsLanPlugin extends Plugin {

    private ServerSocket server;
    private final Map<String, Conn> conns = new ConcurrentHashMap<>();
    private final AtomicInteger nextId = new AtomicInteger(1);

    private static class Conn {
        final String id;
        final Socket socket;
        final BufferedWriter out;

        Conn(String id, Socket socket) throws IOException {
            this.id = id;
            this.socket = socket;
            this.out = new BufferedWriter(new OutputStreamWriter(socket.getOutputStream(), StandardCharsets.UTF_8));
        }

        synchronized void send(String line) throws IOException {
            out.write(line);
            out.write("\n");
            out.flush();
        }

        void close() {
            try { socket.close(); } catch (IOException e) { /* ignore */ }
        }
    }

    private ServerSocket openServer(int port) throws IOException {
        ServerSocket s = new ServerSocket();
        s.setReuseAddress(true);
        s.bind(new InetSocketAddress(port));
        return s;
    }

    @PluginMethod
    public void startServer(PluginCall call) {
        int port = call.getInt("port", 8765);
        stopAll();
        ServerSocket opened;
        try {
            opened = openServer(port);
        } catch (IOException e) {
            call.reject("Could not open port " + port + ": " + e.getMessage());
            return;
        }
        final ServerSocket srv = opened;
        server = srv;
        Thread t = new Thread(() -> acceptLoop(srv));
        t.setDaemon(true);
        t.start();
        JSObject ret = new JSObject();
        ret.put("port", port);
        ret.put("addresses", localAddresses());
        call.resolve(ret);
    }

    private void acceptLoop(ServerSocket srv) {
        while (!srv.isClosed()) {
            try {
                Socket s = srv.accept();
                s.setTcpNoDelay(true);
                String id = "c" + nextId.getAndIncrement();
                final Conn c = new Conn(id, s);
                conns.put(id, c);
                JSObject ev = new JSObject();
                ev.put("id", id);
                notifyListeners("connected", ev);
                Thread rt = new Thread(() -> readLoop(c));
                rt.setDaemon(true);
                rt.start();
            } catch (IOException e) {
                if (srv.isClosed()) break;
            }
        }
    }

    private void readLoop(Conn c) {
        try (BufferedReader in = new BufferedReader(new InputStreamReader(c.socket.getInputStream(), StandardCharsets.UTF_8))) {
            String line;
            while ((line = in.readLine()) != null) {
                JSObject ev = new JSObject();
                ev.put("id", c.id);
                ev.put("data", line);
                notifyListeners("message", ev);
            }
        } catch (IOException e) {
            /* connection closed */
        }
        if (conns.remove(c.id) != null) {
            c.close();
            JSObject ev = new JSObject();
            ev.put("id", c.id);
            notifyListeners("closed", ev);
        }
    }

    @PluginMethod
    public void connect(final PluginCall call) {
        final String host = call.getString("host");
        final int port = call.getInt("port", 8765);
        if (host == null) {
            call.reject("host required");
            return;
        }
        stopAll();
        Thread t = new Thread(() -> {
            Conn c;
            try {
                Socket s = new Socket();
                s.connect(new InetSocketAddress(host, port), 6000);
                s.setTcpNoDelay(true);
                c = new Conn("host", s);
            } catch (Exception e) {
                call.reject("Could not connect: " + e.getMessage());
                return;
            }
            conns.put("host", c);
            JSObject ret = new JSObject();
            ret.put("id", "host");
            call.resolve(ret);
            readLoop(c);
        });
        t.setDaemon(true);
        t.start();
    }

    @PluginMethod
    public void send(PluginCall call) {
        String id = call.getString("id");
        String data = call.getString("data");
        Conn c = id == null ? null : conns.get(id);
        if (c != null && data != null) {
            try { c.send(data); } catch (IOException e) { /* readLoop reports the close */ }
        }
        call.resolve();
    }

    @PluginMethod
    public void closeConn(PluginCall call) {
        String id = call.getString("id");
        Conn c = id == null ? null : conns.get(id);
        if (c != null) c.close();
        call.resolve();
    }

    @PluginMethod
    public void addresses(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("addresses", localAddresses());
        call.resolve(ret);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        stopAll();
        call.resolve();
    }

    private void stopAll() {
        try { if (server != null) server.close(); } catch (IOException e) { /* ignore */ }
        server = null;
        for (Conn c : conns.values()) c.close();
        conns.clear();
    }

    private JSArray localAddresses() {
        JSArray arr = new JSArray();
        try {
            for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                String name = ni.getName() == null ? "" : ni.getName();
                if (!ni.isUp() || ni.isLoopback() || name.startsWith("rmnet") || name.startsWith("ccmni")
                        || name.startsWith("dummy") || name.startsWith("tun")) continue;
                for (InetAddress a : Collections.list(ni.getInetAddresses())) {
                    if (a instanceof Inet4Address && a.isSiteLocalAddress()) arr.put(a.getHostAddress());
                }
            }
        } catch (Exception e) { /* ignore */ }
        return arr;
    }

    @Override
    protected void handleOnDestroy() {
        stopAll();
    }
}
