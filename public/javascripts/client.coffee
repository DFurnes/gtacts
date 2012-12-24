jQuery ->
  # set underscore.js to parse {{ }} instead of <%= %>
  _.templateSettings =
    interpolate: /\{\{(.+?)\}\}/g

  # define contact model
  Contact = Backbone.Model.extend(
    idAttribute: "profile_id"
  )

  # define the master collection
  Directory = Backbone.Collection.extend(
    model: Contact
    url: './api/contacts'
    comparator: (contact) ->
      contact.get('name').toLowerCase()
  )

  # define the rows in the master view
  DirectoryRow = Backbone.View.extend(
    tagName: "li"
    className: "directory-row"
    template: $("#directoryRowTemplate").html()
    events:
      'click': 'selectContact'
    selectContact: (e) ->
      e.preventDefault()
      detail.showContact this.model
    render: () ->
      tmpl = _.template(this.template)
      this.$el.html(tmpl this.model.toJSON())
      
      this
  )

  # define the master view
  DirectoryView = Backbone.View.extend(
    el: $("#directory")
    initialize: () ->
      that = this
      this.collection = new Directory()
      this.collection.fetch(
        success: () ->
          console.log "Fetched directory list!"
          that.render()
        error: () ->
        console.log "Error fetching data for directory list."
      )
    render: (filter) ->
      $("#directory").html("")

      that = this
      _.each(this.collection.models, (item) ->
        unless filter? && not searchMatch(item, filter)
          that.renderContact(item);
      , this)
    renderContact: (item) ->
      directoryRow = new DirectoryRow(
        model: item
      )
      this.$el.append directoryRow.render().el
  )

  # define the detail view
  DetailView = Backbone.View.extend(
    el: $("#contact")
    template: $("#contactDetailTemplate").html()
    showContact: (model) ->
      this.model = model
      this.render()
    render: () ->
      tmpl = _.template(this.template)
      this.$el.html(tmpl this.model.toJSON())
      this
  )

  # create an instance of the master view
  directory = new DirectoryView();
  detail = new DetailView();

  $("#filter").on 'keyup', (e) =>
    console.log "YEAH YEAH"
    e.preventDefault()
    directory.render($("#filter").val())

  $("form").on 'submit', (e) =>
    e.preventDefault()
    false

  searchMatch = (item, filter) ->
    filter = filter.toLowerCase()
    isMatch = false;

    #console.log(item)

    if item.attributes.name.toLowerCase().match(filter)? then isMatch = true

    if item.attributes.phone? && item.attributes.phone.length?
      for phone in item.attributes.phone
        if phone.replace(/\(|\)|\-|\ /g, "").match(filter.replace(/\(|\)|\-|\ /g, ""))? then isMatch = true

    if item.attributes.email? && item.attributes.email.length?
      for email in item.attributes.email
        if email.toLowerCase().match(filter) then isMatch = true

    isMatch