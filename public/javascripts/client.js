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
		}
	});

	// define the master collection
	var Directory = Backbone.Collection.extend({
		model: Contact,
		url: './api/contacts',
		comparator: function(contact) {
			return contact.get('name').toLowerCase();
		}
	});

	// define the rows in the master view
	var DirectoryRow = Backbone.View.extend({
		tagName: "li",
		className: "directory-row",
		template: $("#directoryRowTemplate").html(),
		events: {
			'click': 'selectContact'
		},
		selectContact: function(e) {
			e.preventDefault();
			console.log(this.model);

			detail.showContact(this.model);

		},
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
				console.log("Fetched directory list!");
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

	// define the detail view
	var DetailView = Backbone.View.extend({
		el: $("#contact"),
		template: $("#contactDetailTemplate").html(),
		showContact: function(model) {
			this.model = model;

			this.render();
		},
		render: function() {
			var tmpl = _.template(this.template);
			this.$el.html(tmpl(this.model.toJSON()));
			return this;
		}
	});

	// create an instance of the master view
	var directory = new DirectoryView();
	var detail = new DetailView();
});