# Supertiebreak-opstelling v2.3.4

Webapp voor de wekelijkse Supertiebreak bij TV Nieuw-Vennep.

## Nieuw in v2.3.4

- Eén speler terugzetten naar **Geen reactie**.
- Meerdere geselecteerde spelers tegelijk resetten, terwijl alle andere aanmeldingen behouden blijven.
- **Dringende oproep beëindigen** schrijft automatisch `active: false` naar Firestore.
- Oude, uitgeschakelde en dubbele apparaatregistraties worden automatisch opgeschoond.
- Vóór een dringende pushmelding worden de oproepstatus en apparaatregistraties opnieuw gecontroleerd.
- Cache- en versieverwijzingen bijgewerkt naar v2.3.4.

## Belangrijk bij pushmeldingen

GitHub Pages toont alleen de webapp. Voor automatische pushmeldingen moet de Firebase Cloud Function één keer apart naar Firebase worden gepubliceerd. De webapp ruimt apparaatregistraties op; de Cloud Function moet daarnaast bij het verzenden ongeldige tokens verwijderen.

## Snelkoppeling installeren

- **Android:** open de website in Chrome of Samsung Internet en kies **Toevoegen aan startscherm**.
- **iPhone/iPad:** open de website in Safari, tik op **Deel** en kies **Zet op beginscherm**.
- Installeer geen APK of onbekende app.
