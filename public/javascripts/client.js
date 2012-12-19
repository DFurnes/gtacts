$(function() {
	// some placeholder data to play around with
	// set underscore.js to parse {{ }} instead of <%= %>
	_.templateSettings = {
    interpolate: /\{\{(.+?)\}\}/g
	};

	// define contact model
	var Contact = Backbone.Model.extend({
		idAttribute: "profile_id",
		defaults: {
			photo: "./images/person.png"
		},
		select: function() {
			this.set({selected: true});
			this.collection.selectContact(this);
		}
	});

	// define the directory collection
	var Directory = Backbone.Collection.extend({
		model: Contact,
		url: './api/contacts',
		selectContact: function(contact) {
			this.event.trigger("contact:selected", contact);
		},
		comparator: function(contact) {
			return contact.get('title');
		}
	});

	// define the individual contact view
	var DirectoryRow = Backbone.View.extend({
		tagName: "li",
		className: "directory-row",
		template: $("#directoryRowTemplate").html(),
		render: function() {
			var tmpl = _.template(this.template);
			this.$el.html(tmpl(this.model.toJSON()));
			return this;
		}
	});

	// define the master view
	var DirectoryView = Backbone.View.extend({
		el: $("#directory"),
		initialize: function() {
			var that = this;
			this.collection = new Directory();
			this.collection.fetch({success: function() {
				console.log("fetched directory list!");
				that.render();
			}, error: function() {
				console.log("Error fetching data for directory list.");
			}});
			
		},
		render: function() {
			var that = this;
			_.each(this.collection.models, function(item) {
				that.renderContact(item);
			}, this);
		},
		renderContact: function(item) {
			var directoryRow = new DirectoryRow({
				model: item
			});
			this.$el.append(directoryRow.render().el);
		}
	});

	// var ContactRouter = Backbone.Router.extend({
	// 	routes: {
	// 		"/:id": "showContact"
	// 	},
	// 	initialize: function(options) {
	// 		this.controller = options.controller;
	// 	},
	// 	showContact: function(id) {
	// 		var contact = this.contacts.get(id);
	// 		contact.select();
	// 	}
	// });

	// create an instance of the master view
	var directory = new DirectoryView();
	// var router = new ContactRouter({controller: directory});

});