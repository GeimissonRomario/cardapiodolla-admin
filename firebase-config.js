const firebaseConfig = {
    apiKey: "AIzaSyCPAQ6VaxU46jXzSog6zkiaa8G2s0Mf5uw",
    authDomain: "cardapio-dolla.firebaseapp.com",
    projectId: "cardapio-dolla",
    storageBucket: "cardapio-dolla.firebasestorage.app",
    messagingSenderId: "989312945905",
    appId: "1:989312945905:web:346d7b67a87e5e3f74a350"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();
