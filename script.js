import Sortable from './node_modules/sortablejs/modular/sortable.esm.js';
import { io } from './node_modules/socket.io-client/dist/socket.io.esm.min.js';

class PhotoGallery {
    constructor() {
        this.socket = io();
        this.photos = JSON.parse(localStorage.getItem('photos')) || [];
        this.deletedPhotos = JSON.parse(localStorage.getItem('deletedPhotos')) || [];
        this.currentIndex = 0;
        this.initializeElements();
        this.initializeSortable();
        this.initializeWebSocket();
        this.addEventListeners();
        this.renderGallery();
    }

    initializeElements() {
        this.gallery = document.getElementById('gallery');
        this.recentlyDeleted = document.getElementById('recentlyDeleted');
        this.modal = document.getElementById('modal');
        this.modalImage = document.getElementById('modalImage');
        this.dropZone = this.createDropZone();
        document.body.insertBefore(this.dropZone, this.gallery);
    }

    createDropZone() {
        const dropZone = document.createElement('div');
        dropZone.className = 'drop-zone';
        dropZone.textContent = '画像をドラッグ&ドロップ';
        
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('drag-over');
        });

        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('drag-over');
        });

        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('drag-over');
            
            if (e.dataTransfer.items) {
                [...e.dataTransfer.items].forEach(item => {
                    if (item.type.startsWith('image/')) {
                        const file = item.getAsFile();
                        this.handleFileUpload([file]);
                    } else if (item.type === 'text/plain') {
                        item.getAsString(text => {
                            if (this.isImageUrl(text)) {
                                this.addPhoto(text);
                            }
                        });
                    }
                });
            }
        });

        return dropZone;
    }

    initializeSortable() {
        Sortable.create(this.gallery, {
            animation: 150,
            ghostClass: 'sortable-ghost',
            dragClass: 'sortable-drag',
            onEnd: () => {
                this.updatePhotoOrder();
            }
        });
    }

    initializeWebSocket() {
        this.socket.on('photoAdded', (photo) => {
            this.photos.push(photo);
            this.saveToLocalStorage();
            this.renderGallery();
        });

        this.socket.on('photoDeleted', (data) => {
            if (data.fromGallery) {
                const index = this.photos.findIndex(p => p.url === data.url);
                if (index !== -1) {
                    const deletedPhoto = this.photos.splice(index, 1)[0];
                    this.deletedPhotos.unshift(deletedPhoto);
                }
            } else {
                const index = this.deletedPhotos.findIndex(p => p.url === data.url);
                if (index !== -1) {
                    this.deletedPhotos.splice(index, 1);
                }
            }
            this.saveToLocalStorage();
            this.renderGallery();
        });

        this.socket.on('orderChanged', (photos) => {
            this.photos = photos;
            this.saveToLocalStorage();
            this.renderGallery();
        });
    }

    addEventListeners() {
        document.getElementById('addBtn').addEventListener('click', () => this.addPhoto());
        document.getElementById('imageFile').addEventListener('change', (e) => this.handleFileUpload(e.target.files));
        document.getElementById('galleryBtn').addEventListener('click', () => this.switchView('gallery'));
        document.getElementById('recentlyDeletedBtn').addEventListener('click', () => this.switchView('recentlyDeleted'));
        document.querySelector('.close').addEventListener('click', () => this.closeModal());
        document.querySelector('.prev').addEventListener('click', () => this.navigate(-1));
        document.querySelector('.next').addEventListener('click', () => this.navigate(1));
        document.getElementById('downloadBtn').addEventListener('click', () => this.downloadCurrentImage());
        document.getElementById('deleteBtn').addEventListener('click', () => this.deleteCurrentImage());

        window.addEventListener('paste', (e) => {
            const items = e.clipboardData.items;
            for (let item of items) {
                if (item.type.startsWith('image/')) {
                    const file = item.getAsFile();
                    this.handleFileUpload([file]);
                }
            }
        });
    }

    isImageUrl(url) {
        return /\.(jpg|jpeg|png|gif|webp)$/i.test(url);
    }

    async addPhoto(url) {
        const urlInput = document.getElementById('imageUrl');
        url = url || urlInput.value.trim();
        
        if (url) {
            try {
                const response = await fetch(url);
                if (response.ok) {
                    const photo = { url, date: new Date().toISOString() };
                    this.photos.push(photo);
                    this.socket.emit('photoAdded', photo);
                    this.saveToLocalStorage();
                    this.renderGallery();
                    urlInput.value = '';
                }
            } catch (error) {
                alert('Invalid image URL');
            }
        }
    }

    handleFileUpload(files) {
        Array.from(files).forEach(file => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const photo = { url: e.target.result, date: new Date().toISOString() };
                this.photos.push(photo);
                this.socket.emit('photoAdded', photo);
                this.saveToLocalStorage();
                this.renderGallery();
            };
            reader.readAsDataURL(file);
        });
    }

    updatePhotoOrder() {
        const newOrder = [...this.gallery.children].map(card => {
            return this.photos.find(photo => photo.url === card.querySelector('img').src);
        });
        this.photos = newOrder;
        this.socket.emit('orderChanged', this.photos);
        this.saveToLocalStorage();
    }

    renderGallery() {
        this.gallery.innerHTML = '';
        this.photos.forEach((photo, index) => {
            const card = this.createImageCard(photo, index);
            this.gallery.appendChild(card);
        });

        this.recentlyDeleted.innerHTML = '';
        this.deletedPhotos.forEach((photo, index) => {
            const card = this.createImageCard(photo, index, true);
            this.recentlyDeleted.appendChild(card);
        });
    }

    createImageCard(photo, index, isDeleted = false) {
        const card = document.createElement('div');
        card.className = 'image-card';
        const img = document.createElement('img');
        img.src = photo.url;
        img.loading = 'lazy';
        card.appendChild(img);

        card.addEventListener('click', () => {
            this.currentIndex = index;
            this.openModal(isDeleted);
        });

        return card;
    }

    openModal(isDeleted = false) {
        this.modal.classList.add('active');
        const photos = isDeleted ? this.deletedPhotos : this.photos;
        this.modalImage.src = photos[this.currentIndex].url;
    }

    closeModal() {
        this.modal.classList.remove('active');
    }

    navigate(direction) {
        const photos = this.gallery.classList.contains('active') ? this.photos : this.deletedPhotos;
        this.currentIndex = (this.currentIndex + direction + photos.length) % photos.length;
        this.modalImage.src = photos[this.currentIndex].url;
    }

    async downloadCurrentImage() {
        const photos = this.gallery.classList.contains('active') ? this.photos : this.deletedPhotos;
        const photo = photos[this.currentIndex];
        
        try {
            const response = await fetch(photo.url);
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `image-${Date.now()}.jpg`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        } catch (error) {
            alert('Failed to download image');
        }
    }

    deleteCurrentImage() {
        const fromGallery = this.gallery.classList.contains('active');
        const photos = fromGallery ? this.photos : this.deletedPhotos;
        const photo = photos[this.currentIndex];

        if (fromGallery) {
            const deletedPhoto = this.photos.splice(this.currentIndex, 1)[0];
            this.deletedPhotos.unshift(deletedPhoto);
        } else {
            this.deletedPhotos.splice(this.currentIndex, 1);
        }

        this.socket.emit('photoDeleted', { url: photo.url, fromGallery });
        this.saveToLocalStorage();
        this.closeModal();
        this.renderGallery();
    }

    switchView(view) {
        const galleryBtn = document.getElementById('galleryBtn');
        const recentlyDeletedBtn = document.getElementById('recentlyDeletedBtn');
        
        if (view === 'gallery') {
            this.gallery.classList.add('active');
            this.recentlyDeleted.classList.remove('active');
            galleryBtn.classList.add('active');
            recentlyDeletedBtn.classList.remove('active');
        } else {
            this.gallery.classList.remove('active');
            this.recentlyDeleted.classList.add('active');
            galleryBtn.classList.remove('active');
            recentlyDeletedBtn.classList.add('active');
        }
    }

    saveToLocalStorage() {
        localStorage.setItem('photos', JSON.stringify(this.photos));
        localStorage.setItem('deletedPhotos', JSON.stringify(this.deletedPhotos));
    }
}

new PhotoGallery();