# Supertiebreak-opstelling v2.3.7

Webapp voor de wekelijkse Supertiebreak bij TV Nieuw-Vennep.

## Nieuw in v2.3.7

- Optioneel singles toestaan: bijvoorbeeld 14 spelers op 4 banen als 3 dubbels + 1 single.
- Automatisch én handmatig indelen ondersteunen deze speelvorm.
- WhatsApp-tekst bij vrije plekken vraagt expliciet om een reactie.
- In de definitieve WhatsApp-indeling staat `-` tussen de teams.

## Beveiliging uit v2.3.6

- Firestore gebruikt permanente Security Rules in plaats van tijdelijke Test Mode-regels.
- De organisator-PIN wordt veilig op de server gecontroleerd via Firebase Cloud Functions.
- Firebase Authentication geeft na een geldige PIN tijdelijk organisatorrechten aan deze browsersessie.
- De PIN-hash is niet meer leesbaar vanuit de browser.
- Alleen de organisator kan spelers, banen, indelingen, archief en pushapparaten beheren.
- Deelnemers kunnen zonder account gewoon Ja, Misschien of Nee blijven kiezen.
- De Cloud Function synchroniseert archiefreacties en verstuurt dringende pushmeldingen.
- Zie `FIREBASE-BEVEILIGING.txt` voor de verplichte installatievolgorde.

## Snelkoppeling installeren

- **Android:** open de website in Chrome of Samsung Internet en kies **Toevoegen aan startscherm**.
- **iPhone/iPad:** open de website in Safari, tik op **Deel** en kies **Zet op beginscherm**.
- Installeer geen APK of onbekende app.
