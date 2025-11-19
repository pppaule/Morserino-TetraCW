#include <Arduino.h>
#include <TetraRadio.h>
#include "MorseOutput.h" // ggf. anpassen, je nach Pfad

const char* initCommands[] = {
  "ATE0",
  "AT+CSCS=8859-",
  "AT+CTSP=1,1,11",
  "AT+CTSP=2,0,0",
  "AT+CREG=2",
  "AT+IFC=0,0",
  "AT+CTSP=1,3,2",
  "ATI",
  "AT+GMI",
  "AT+CTGS?",
  "AT+CTSP=2,2,20",
  "AT+CTSP=1,3,130",
  "AT+CTSP=1,3,137",
  "AT+CTSP=1,3,138",
  "AT+CTSP=1,3,140",
  "AT+GMI?",
  "AT+CNUMF?",
  "AT+GMM"
  //"ATI1",
  // "AT+CTSP=1,3,3",
  // "AT+CTSP=1,3,131",
  // "AT+CTSP=1,3,10",
  // "AT+CTSP=1,3,224",
  // "AT+CTSP=1,3,195",
  // "AT+CTSP=1,3,204",
  // "AT+CTSP=1,3,210",
  // "AT+CTSP=1,3,220",
  // "AT+CTSP=1,3,242",
  // "ATI7",
  // "AT+CTGL=0,0,1",
  "AT+MCDNTN=PIZZA PASTA,DO4PPL,10,4"
};
const int numCommands = sizeof(initCommands) / sizeof(initCommands[0]);
unsigned long lastSendTime = 0;
int currentCmd = 0;
unsigned long pauseTime = 500; // Pausenzeit in ms, einstellbar

void init_tetra() 
{
  MorseOutput::printToScroll(REGULAR, "Starte Tetra-Init...", false, false);

  const unsigned long serialTimeout = 2000; // Timeout in ms, anpassbar
  for (int i = 0; i < numCommands; ++i) {
    Serial.println(i);
    Serial.println(initCommands[i]);
    MorseOutput::printToScroll(REGULAR, String(initCommands[i]), false, false);

    unsigned long startTime = millis();
    //String reply = "";
    bool gotReply = false;
    delay(1000);
    // while (millis() - startTime < serialTimeout) {
    //   if (Serial.available()) {
    //     char c = Serial.read();
    //     if (c == '\n' || c == '\r') {
    //       reply.trim();
    //       if (reply == "OK") {
    //         MorseOutput::printToScroll(REGULAR, "Antwort: OK", false, false);
    //         gotReply = true;
    //         break;
    //       } else if (reply.startsWith("ERROR")) {
    //         MorseOutput::printToScroll(REGULAR, "Antwort: " + reply, false, false);
    //         gotReply = true;
    //         break;
    //       }
    //       reply = "";
    //     } else {
    //       reply += c;
    //     }
    //   }
    // }
    // if (!gotReply) {
    //   Serial.println("TIMEOUT");
    //   MorseOutput::printToScroll(REGULAR, "Antwort: TIMEOUT", false, false);
    //   // Optional: Fehlerbehandlung oder Abbruch
    // }
    // if (reply.startsWith("ERROR")) {
    //   Serial.println("Fehler bei Init: " + reply);
    //   MorseOutput::printToScroll(REGULAR, "Fehler: " + reply, false, false);
    //   // Optional: Abbruch oder weiter
    // }
  }
}


// boolean msg_popUp(const String& expectedRecipient, unsigned long timeoutMs) {
//   MorseOutput::clearDisplay();
//   MorseOutput::printToScroll(REGULAR, "Empfaenger?", false, false);

//   String input = "";
//   unsigned long startTime = millis();

//   while (millis() - startTime < timeoutMs) {
//     // Beispiel: Morse-Eingabe abfragen (hier als Platzhalter)
//     if (Serial.available()) {
//       char c = Serial.read();
//       if (c == '\n' || c == '\r') {
//         input.trim();
//         MorseOutput::printToScroll(REGULAR, "Eingabe: " + input, false, false);
//         if (input == expectedRecipient) {
//           MorseOutput::printToScroll(REGULAR, "Empfaenger OK", false, false);
//           return true;
//         } else {
//           MorseOutput::printToScroll(REGULAR, "Empfaenger falsch", false, false);
//           return false;
//         }
//       } else {
//         input += c;
//         MorseOutput::printToScroll(REGULAR, String(c), false, false);
//       }
//     }
//     // Beispiel: Tastenabfrage (kurz/lang)
//     if (Buttons::shortPress()) {
//       MorseOutput::printToScroll(REGULAR, "JA", false, false);
//       return true;
//     }
//     if (Buttons::longPress()) {
//       MorseOutput::printToScroll(REGULAR, "NEIN", false, false);
//       return false;
//     }
//     delay(10); // Kurze Pause zur Entlastung der CPU
//   }
//   MorseOutput::printToScroll(REGULAR, "Timeout!", false, false);
//   return false;
// }


// boolean msg_popUp(){
//   // draw black rounded rectangle
//   // render text whats the receipient?
//   while(1){
//   // shoort = yes
//   // long = no
//   // morse in number or callsign
//  // if alles return true
//  // if timeout oder break != callsign oder issr nr return false
//   }
// }