// Gedeelde toestand van het beheer.
//  api:        gegevenslaag (api.js of de demo)
//  email:      ingelogde beheerder
//  navigatie:  teller die bij elke navigatie verhoogt; een pagina die na een await
//              merkt dat de teller veranderd is, tekent niets meer (gebruiker is al verder)
//  vuil:       functie die true geeft als er niet-bewaarde wijzigingen zijn

export const staat = {
  api: null,
  email: null,
  navigatie: 0,
  vuil: null,
};
