# TETRA Terminal

Diese HTML/JavaScript-Anwendung steuert zwei Tetra Amateurfunkgeräte direkt aus dem Browser über die Web Serial API. Neben einer Reihe fester AT-Befehle bietet das Tool umfassende Unterstützung für SDS und GPS.
Version für den PI. Läuft auf einem PI5 mit M2 NVME und einem USB UCA202 Audiointerface. Ubuntu24.04, mysql-server, apache2, node.js, npm


<img width="1439" height="785" alt="Bildschirmfoto 2025-08-24 um 14 07 04" src="https://github.com/user-attachments/assets/6eca1908-2b35-4cd2-8ab9-65fb4a6a97d8" />




## Funktionsumfang

* **Serielle Verbindung über tetraterm.conf** – beide Geräte werden dauerhaft über den Dienst verbunden; Baudrate und Gerätepfade stehen in `tetraterm.conf`.
* **Mehrgerätebetrieb** – zwei Funkgeräte können parallel verbunden und separat gesteuert werden.
* **Audio-Streaming & PTT** – bidirektionale Audioübertragung mit je einem PTT-Button pro Gerät; das gemeinsame Interface (`audioDevice`) wird in `tetraterm.conf` definiert, Gerät 1 nutzt den linken und Gerät 2 den rechten Kanal.
* **Vordefinierte AT-Befehle** – Buttons senden z. B. `AT+CSQ?`, `AT+CTOM`, `AT+CTGS` usw. Die Signalstärke wird dabei in dBm umgerechnet und im Log sowie als Verlaufsgrafik dargestellt.
* **Manuelle Befehle** – jedes beliebige AT-Kommando kann direkt eingegeben werden.
* **TNP1-Profile** – alle Service-Profile lassen sich auf einmal oder einzeln aktivieren.
* **AT-Profile** – frei definierbare Befehlsfolgen lassen sich speichern und mit einem Klick ausführen.
* **SDS-Mappings** – eingehende SDS (Status oder Text) können automatisch ein AT-Profil auslösen; optional mit ISSI-Whitelist und Zielgerät.
* **DAPNET→SDS Weiterleitung** – DAPNET-Nachrichten lassen sich per Filter an definierte ISSIs als SDS weiterleiten.
* **SDS-Funktionen**
  * Versand von Text-, Flash- und Status-SDS
  * Senden von LIP-, Long‑LIP- und LRRP-Paketen
  * Abfrage der GPS-Position anderer ISSIs (einmalig oder im Intervall)
  * automatische Empfangsbestätigung (ACK) – kann per Checkbox deaktiviert werden
* **Talkgroup-Anzeige** – aktive TGs werden mit optionalem Kontaktnamen eingeblendet.
* **Kartendarstellung** – empfangene Koordinaten werden auf einer OpenStreetMap-Karte markiert.
* **HamnetDB-Marker** – ausgewählte Relaisstandorte sind statisch eingebunden und werden auf der Karte angezeigt.
* **RSSI-Diagramm** – ein Chart zeigt den zeitlichen Verlauf der Signalstärke.
* **MySQL-Logging**
  * Speicherung aller gesendeten Befehle, SDS- und GPS-Daten
  * Filter- und Sortiermöglichkeiten in einer Tabelle
  * Export als CSV oder JSON sowie Import von JSON
  * Leeren der Datenbank bei Bedarf
* **Umschaltbarer Darkmode** – optional dunkles Farbschema
* **Kontaktverwaltung & -anzeige** – Verwaltung von Kontakten und Talkgroups mit eigener Webansicht.
* **Log-Viewer** – browserbasierte Darstellung und Filterung der gespeicherten MySQL-Logs.
* **Marker- und Track-Datenbank** – empfangene Koordinaten lassen sich als Marker oder Track in der Datenbank speichern.

## Installation

1. Repository klonen:

  ```bash
  git clone https://github.com/Torben-DJ2TH/Tetra-Term-PI.git
   ```

2. Installationsskript ausführen (als root):

   ```bash
   cd Tetra-Term-PI/
   
   sudo ./install.sh
   ```

   Optional kann mit `--force-new` eine vorherige Installation vollständig entfernt werden (löscht Dateien in `/var/www/html`, systemd-Dienste und die MySQL-Datenbank):

   ```bash
   sudo ./install.sh --force-new
   ```


   Das Skript installiert alle benötigten Pakete, richtet MySQL, Apache und die systemd-Dienste ein und kopiert die Dateien nach `/var/www/html`.

2. Die Weboberfläche im Browser aufrufen: `http://<IP-des-Geräts>` oder `https://<IP-des-Geräts>` (selbstsigniertes Zertifikat). Audio benötigt https://...

## Initiale Konfiguration

Beim Start des Dienstes werden automatisch diverse AT-Befehle ausgeführt, unter anderem `ATE0`, `AT+CSCS="8859-1"`, mehrere `AT+CTSP`-Parameter sowie `AT+CTGL=0,0,1`. Eine ausführliche Liste befindet sich im Quellcode der Datei `serial.js`.
In `tetraterm.conf` wird ein gemeinsames Audio-Interface (`audioDevice`) für beide Geräte definiert. Gerät 1 verwendet den linken, Gerät 2 den rechten Kanal des UCA222.

## Nutzung

Die benötigten Leaflet- und Chart.js-Dateien im Verzeichnis `libs` und werden auch offline eingebunden.

Alle Files auf den PI nach /var/www/html/ kopieren, npm istall im Verzeichniss aufrufen, Datein aus dem system ordner verschieben...
 
Beim Laden der Seite wird die Kommunikation automatisch aufgebaut. Baudrate, Gerätepfade und die ISSI der Geräte sind in `tetraterm.conf` hinterlegt.
Sind Audio-Geräte konfiguriert, können die PTT-Buttons genutzt werden, um das bidirektionale Audio-Streaming je Gerät zu steuern.

## Web‑Parser

Der Parser nutzt eine WebSocket-Verbindung von tmo.services und empfängt die Daten in Echtzeit. Er zeigt Relaiszustände, QRV-Meldungen und Web-Logs an und aktualisiert bei Bedarf Marker auf der Karte.

## Offline-Funktionen

Durch einen Service Worker werden grundlegende Offline-Fähigkeiten bereitgestellt.
Beim ersten Aufruf werden alle wesentlichen Skripte sowie benötigte Kartendaten
zwischengespeichert. OSM-Kacheln werden nach dem Prinzip „Cache first“ geladen,
so dass bereits abgerufene Tiles auch ohne Netzwerkverbindung verfügbar sind.

## DAPNET TCP Anbindung

Die DAPNET‑Nachrichten können nun direkt im Browser empfangen werden.
Dazu wird eine WebSocket‑Verbindung zur DAPNET‑Infrastruktur aufgebaut.
Nach dem Öffnen der Verbindung wird das Login in der Form
`[TetraTMOGateway v1.0 &lt;callsign&gt; &lt;authKey&gt;]` gesendet. Danach werden
eingehende POCSAG‑Nachrichten sofort im Textfeld und im Browser‑Log
angezeigt. Diese Implementierung basiert auf Teilen des
Open-Source-Projekts g4klx/DAPNETGateway. Eingehende Nachrichten können
anhand von Adresse, Funktion, Text oder Regex gefiltert und automatisch
als SDS an ausgewählte ISSIs weitergeleitet werden.

## Betrieb auf Raspberry Pi

1. Apache2, mysql-server, node.js und npm auf dem Raspberry Pi installieren.
2. MySQL-Datenbank `tetra` anlegen und das optimierte Schema aus `system/mysql-schema-optimized.sql` importieren (alternativ `system/mysql-schema.sql`).
3. Die Zuordnung der seriellen Geräte erfolgt über die in `tetraterm.conf` hinterlegten ISSI‑Werte. Beim Start wird auf jedem konfigurierten `tty` per `AT+CNUMF?` die ISSI ermittelt und dem passenden Gerät zugewiesen, sodass vertauschte Ports automatisch erkannt werden.
4. Alle Dateinen und Ordner nach /var/www/html/ kopieren.
5. Den Server als systemd-Dienst betreiben. Die Datei `system/tetra-terminal.service` nach `/etc/systemd/system/` kopieren, `WorkingDirectory` und `ExecStart` anpassen und den Dienst mit `systemctl enable --now tetra-terminal` aktivieren.
6. Die Datei `system/core-ws-logger.service` nach `/etc/systemd/system/` kopieren und den Dienst mit `systemctl enable --now core-ws-logger` aktivieren. (startet npm als Dienst)
7. Apache installieren und das Projektverzeichnis als `DocumentRoot` einbinden, damit `index.html` und die Skripte ausgeliefert werden. Eine Beispielkonfiguration liegt unter `system/000-default.conf`.
8. Abhängigkeiten installieren: `npm install` (in /var/www/html/).
9. Benötigte Apache-Module aktivieren (`proxy`, `proxy_http`, `proxy_wstunnel`), damit HTTP‑ und WebSocket‑Weiterleitungen funktionieren:

   ```bash
   sudo a2enmod proxy proxy_http proxy_wstunnel
   sudo systemctl restart apache2
   ```
10. Die Seite im Browser über die IP des Pis aufrufen; das Terminal kommuniziert dann remote über den WebSocket-Server.

Apache Config liegt im systemordner:

```
ProxyPass /api http://localhost:3000/api
ProxyPassReverse /api http://localhost:3000/api
ProxyPass /ws ws://localhost:8080/
ProxyPassReverse /ws ws://localhost:8080/
```
11. Der system Ordner kann nun aus dem DocumentRoot des Webservers raus.

## OffTopic:

Und bevor jemand fragt: Natürlich braucht man im TETRA keinen Squelch. Da der Pi den Ton aber über die USB-Soundkarte aufnimmt (analog) und mit arecord zu einen Stream verarbeitet,
stört ein zusätzlicher Squelch im Client nicht – im Gegenteil: Er unterdrückt effektiv Nebengeräusche. 😉


## Ganz großes Danke geht an:

- **Lukas**
- **Lawrence**
- **Peter**
- **Ben**
- **Nils**
- **afu-nord.de**

  Ohne die großartige Arbeit von afu-nord.de wäre dieses Projekt nicht möglich. Doch Geräte, Infrastruktur, Standortmieten und Sprietkosten verursachen
  erhebliche Ausgaben – ganz zu schweigen von der unzähligen Zeit, die einzelne OM’s in den Betrieb investieren.
  Da dieses Projekt auf genau dieser Infrastruktur aufbaut und ohne diese nicht funktionieren würde, könnt ihr helfen:
  ➡️ Nutzt den Spenden-Button auf afu-nord.de – jeder Beitrag unterstützt deren wertvolle Arbeit, von der wir alle profitieren.


- **ChatGPT**



## Quellen

* [Leaflet](https://leafletjs.com)
* [Chart.js](https://www.chartjs.org)
* [OpenStreetMap](https://www.openstreetmap.org)
* [Flaticon](https://www.flaticon.com)
* [DAPNET](https://www.hampager.de)
* [HamnetDB](https://hamnetdb.net) (über `https://r.jina.ai`)
* [tmo.services](https://tmo.services)
* [g4klx/DAPNETGateway](https://github.com/g4klx/DAPNETGateway)
* [dl1hrc/svxlink](https://github.com/dl1hrc/svxlink/tree/tetra-contrib)
* [db0wiz](https://db0wiz.de/mtm5400-via-uca222-mit-svxlink/)
* [radioID](https://radioid.net/)
* [ETSI](https://www.etsi.org/technologies/tetra)
* [wikipedia](https://de.wikipedia.org/wiki/Terrestrial_Trunked_Radio)

## Copyright

© 2025 DJ2TH / Torben Hahlbeck. Die Nutzung und Weitergabe dieses Projekts ist für
nicht kommerzielle Zwecke gestattet. Bitte die Nutzungsregeln der externen Quellen eigenständig erfragen und beachten.
Fragen und Anregungen bitte an dj2th@darc.de

